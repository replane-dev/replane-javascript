import { expect, it, vi } from "vitest";
import { createReplaneClient, ReplaneError } from "../src";

it("createReplaneClient.getConfig encodes name and handles text response", async () => {
  const fetchMock = vi.fn(
    async () =>
      new Response("raw-value", {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
  ) as any;

  const client = createReplaneClient({
    apiKey: "TKN",
    baseUrl: "https://api.local",
    fetchFn: fetchMock,
  });
  const value = await client.getConfig("space key");
  expect(value).toBe("raw-value");
  const callUrl = fetchMock.mock.calls[0][0];
  expect(callUrl).toBe("https://api.local/api/v1/configs/space%20key/value");
});

it("errors produce ReplaneError with status & body", async () => {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })
  ) as any;
  const client = createReplaneClient({
    apiKey: "TKN",
    baseUrl: "https://api.local",
    fetchFn: fetchMock,
  });
  await expect(client.getConfig("missing")).rejects.toMatchObject({
    name: "ReplaneError",
    status: 404,
  });
});
