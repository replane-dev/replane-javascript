import { Channel } from "async-channel";
import type { ReplicationStreamRecord, StartReplicationStreamBody } from "../src/types";

export function createFetchMock(
  handler: (req: Request, signal?: AbortSignal) => Response | Promise<Response>
) {
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    // Check if already aborted
    if (init?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    // Normalize to a real Request object
    const req = input instanceof Request ? input : new Request(input.toString(), init);

    // Create a promise that rejects when the signal is aborted
    const abortPromise = init?.signal
      ? new Promise<never>((_, reject) => {
          init.signal!.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        })
      : null;

    // Race between the handler and the abort signal
    const handlerPromise = handler(req, init?.signal ?? undefined);
    const res = abortPromise
      ? await Promise.race([handlerPromise, abortPromise])
      : await handlerPromise;

    if (!(res instanceof Response)) {
      throw new Error("Mock handler must return a Response");
    }

    return res;
  };

  return fetchFn;
}

export interface ReplaneServerMockHandler {
  startReplicationStream: (
    body: StartReplicationStreamBody,
    signal?: AbortSignal
  ) => AsyncIterable<ReplicationStreamRecord>;
}

export function createReplaneServerMock(handler: ReplaneServerMockHandler) {
  const fetchFn = createFetchMock(async (req, signal) => {
    if (typeof req === "string") {
      return new Response("Invalid request", { status: 400 });
    }

    if (req instanceof URL) {
      return new Response("Invalid request", { status: 400 });
    }

    const url = new URL(req.url);
    const method = req.method;

    if (method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (url.pathname !== "/api/sdk/v1/replication/stream") {
      return new Response("Not found", { status: 404 });
    }

    if (req.headers.get("Content-Type") !== "application/json") {
      return new Response("Invalid content type: " + req.headers.get("Content-Type"), {
        status: 400,
      });
    }

    const body = JSON.parse(await req.json()) as StartReplicationStreamBody;

    if (!Array.isArray(body.currentConfigs)) {
      return new Response("Invalid request", { status: 400 });
    }

    if (!Array.isArray(body.requiredConfigs)) {
      return new Response("Invalid request", { status: 400 });
    }

    const replicationStream = handler.startReplicationStream(body, signal);

    const sseStream = new ReadableStream<SseEvent>({
      async start(controller) {
        // Handle abort signal
        const onAbort = () => {
          controller.close();
        };
        signal?.addEventListener("abort", onAbort);

        try {
          controller.enqueue({ type: "connected" });
          controller.enqueue({ type: "ping" });
          controller.enqueue({ type: "ping" });

          for await (const event of replicationStream) {
            if (signal?.aborted) {
              break;
            }
            controller.enqueue({ type: "data", data: JSON.stringify(event) });
            controller.enqueue({ type: "ping" });
          }

          if (!signal?.aborted) {
            controller.enqueue({ type: "ping" });
            controller.enqueue({ type: "ping" });
            controller.close();
          }
        } catch (error) {
          if (!signal?.aborted) {
            controller.error(error);
          }
        } finally {
          signal?.removeEventListener("abort", onAbort);
        }
      },
    }).pipeThrough(new SseEncoderStream());

    return new Response(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
  return fetchFn;
}

type SseEvent = { type: "data"; data: string } | { type: "ping" } | { type: "connected" };

class SseEncoderStream extends TransformStream<SseEvent, Uint8Array> {
  constructor() {
    const encoder = new TextEncoder();

    super({
      transform(chunk, controller) {
        if (chunk.type === "data") {
          controller.enqueue(encoder.encode(`data: ${chunk.data}\n\n`));
        } else if (chunk.type === "ping") {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } else if (chunk.type === "connected") {
          controller.enqueue(encoder.encode(": connected\n\n"));
        } else {
          const _: never = chunk;
          throw new Error(`Unknown SSE event type: ${JSON.stringify(chunk)}`);
        }
      },
    });
  }
}

export class MockReplaneServerController {
  private readonly knownConnections = new Set<MockReplaneServerConnection>();
  private readonly connections = new Channel<MockReplaneServerConnection>();
  public readonly fetchFn: ReturnType<typeof createReplaneServerMock>;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    this.fetchFn = createReplaneServerMock({
      startReplicationStream: async function* (
        body: StartReplicationStreamBody,
        signal?: AbortSignal
      ) {
        const connection = new MockReplaneServerConnection(body, signal);
        await self.reportConnection(connection);

        yield* connection.events;
      },
    });
  }

  async acceptConnection(): Promise<MockReplaneServerConnection> {
    return await this.connections.get();
  }

  async reportConnection(connection: MockReplaneServerConnection) {
    this.knownConnections.add(connection);
    await this.connections.push(connection);
  }

  async close() {
    for (const connection of this.knownConnections) {
      connection.close();
    }
    this.connections.close();
    this.knownConnections.clear();
  }
}

export class MockReplaneServerConnection {
  private readonly _events = new Channel<ReplicationStreamRecord>();
  private readonly _signal?: AbortSignal;

  constructor(
    private readonly body: StartReplicationStreamBody,
    signal?: AbortSignal
  ) {
    this._signal = signal;

    // Close the channel when the signal is aborted
    if (signal) {
      signal.addEventListener("abort", () => {
        this._events.close();
      });
    }
  }

  get signal(): AbortSignal | undefined {
    return this._signal;
  }

  get aborted(): boolean {
    return this._signal?.aborted ?? false;
  }

  get events(): AsyncIterable<ReplicationStreamRecord> {
    return this._events;
  }

  async push(event: ReplicationStreamRecord) {
    if (this._signal?.aborted) {
      return;
    }
    await this._events.push(event);
  }

  async throw(error: Error) {
    if (this._signal?.aborted) {
      return;
    }
    await this._events.throw(error);
  }

  close() {
    this._events.close();
  }
}
