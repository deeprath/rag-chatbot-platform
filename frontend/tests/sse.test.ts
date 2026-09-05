import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/auth/keycloak", () => ({
  keycloak: {
    token: "fake-token",
    updateToken: vi.fn().mockResolvedValue(false),
  },
}));

import { streamChat } from "../src/api/sse";

function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("streamChat", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses session/token/done events in order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          'event: session\ndata: "sess-123"\n\n',
          'event: token\ndata: "Hel"\n\n',
          'event: token\ndata: "lo"\n\n',
          'event: done\ndata: ""\n\n',
        ]),
      ),
    );

    const onSession = vi.fn();
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await streamChat({ message: "hi" }, { onSession, onToken, onDone, onError });

    expect(onSession).toHaveBeenCalledWith("sess-123");
    expect(onToken).toHaveBeenNthCalledWith(1, "Hel");
    expect(onToken).toHaveBeenNthCalledWith(2, "lo");
    expect(onDone).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("handles a token split across two network chunks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse(['event: token\ndata: "Hello wor', 'ld"\n\n', "event: done\ndata: \"\"\n\n"]),
      ),
    );

    const onToken = vi.fn();
    await streamChat({ message: "hi" }, { onToken });

    expect(onToken).toHaveBeenCalledWith("Hello world");
  });

  it("surfaces a non-2xx response via onError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    const onError = vi.fn();
    await streamChat({ message: "hi" }, { onError });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining("500"));
  });
});
