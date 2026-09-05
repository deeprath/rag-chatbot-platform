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

  // Regression test: a real ERR_INCOMPLETE_CHUNKED_ENCODING was observed in
  // practice (a proxy/network layer closing the connection mid-response) —
  // `reader.read()` rejects, and previously nothing called onError/onDone,
  // leaving the UI's "assistant is typing" indicator stuck forever.
  it("surfaces a mid-stream read failure via onError, and still calls onDone", async () => {
    const encoder = new TextEncoder();
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(encoder.encode('event: token\ndata: "Hel"\n\n'));
        } else {
          controller.error(new TypeError("Failed to fetch")); // no "done" frame ever arrives
        }
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));

    const onToken = vi.fn();
    const onError = vi.fn();
    const onDone = vi.fn();
    await streamChat({ message: "hi" }, { onToken, onError, onDone });

    expect(onToken).toHaveBeenCalledWith("Hel");
    expect(onError).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("surfaces a clean stream close with no terminal frame via onError + onDone", async () => {
    // The connection closes normally (reader.read() -> {done: true}) but no
    // "event: done"/"event: error" frame was ever sent — e.g. the server
    // process died mid-response, or a proxy truncated it cleanly.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sseResponse(['event: token\ndata: "partial"\n\n'])),
    );

    const onToken = vi.fn();
    const onError = vi.fn();
    const onDone = vi.fn();
    await streamChat({ message: "hi" }, { onToken, onError, onDone });

    expect(onToken).toHaveBeenCalledWith("partial");
    expect(onError).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("a deliberate abort (AbortError) does not call onError/onDone — the caller resets its own state", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const err = new DOMException("The operation was aborted.", "AbortError");
        controller.error(err);
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));

    const onError = vi.fn();
    const onDone = vi.fn();
    await streamChat({ message: "hi" }, { onError, onDone });

    expect(onError).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
