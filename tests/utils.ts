import { Channel } from "async-channel";
import { ProjectEvent } from "../src/types";

export function createFetchMock(handler: (req: RequestInfo | URL) => Response | Promise<Response>) {
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    // Normalize to a real Request object
    const req = input instanceof Request ? input : new Request(input.toString(), init);

    // Call handler
    const res = await handler(req);

    if (!(res instanceof Response)) {
      throw new Error("Mock handler must return a Response");
    }

    return res;
  };

  return fetchFn;
}

export interface ReplaneServerMockHandler {
  getProjectEvents: (params: { includeInitialConfigs: boolean }) => AsyncIterable<ProjectEvent>;
}

export function createReplaneServerMock(handler: ReplaneServerMockHandler) {
  const fetchFn = createFetchMock(async (req) => {
    const url = typeof req === "string" || req instanceof URL ? new URL(req) : new URL(req.url);
    const method = typeof req === "string" || req instanceof URL ? "GET" : req.method;
    const includeInitialConfigs = url.searchParams.get("includeInitialConfigs") === "true";

    if (method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (url.pathname === "/api/v1/events") {
      const events = handler.getProjectEvents({ includeInitialConfigs });

      const stream = new ReadableStream<SseEvent>({
        async start(controller) {
          controller.enqueue({ type: "connected" });
          controller.enqueue({ type: "ping" });
          controller.enqueue({ type: "ping" });

          for await (const event of events) {
            controller.enqueue({ type: "data", data: JSON.stringify(event) });
            controller.enqueue({ type: "ping" });
          }
          controller.enqueue({ type: "ping" });
          controller.enqueue({ type: "ping" });
          controller.close();
        },
      }).pipeThrough(new SseEncoderStream());

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }
    return new Response("Not found", { status: 404 });
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
      getProjectEvents: async function* () {
        const connection = new MockReplaneServerConnection();
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
  private readonly _events = new Channel<ProjectEvent>();

  get events(): AsyncIterable<ProjectEvent> {
    return this._events;
  }

  async push(event: ProjectEvent) {
    await this._events.push(event);
  }

  async throw(error: Error) {
    await this._events.throw(error);
  }

  close() {
    this._events.close();
  }
}
