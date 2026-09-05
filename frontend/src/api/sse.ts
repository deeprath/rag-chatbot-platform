import { keycloak } from "../auth/keycloak";

/**
 * Server-Sent Events over a POST request. The browser's built-in `EventSource`
 * can't send a body or an Authorization header, so this streams the response
 * of a plain `fetch` and parses "event: X\ndata: Y\n\n" frames by hand — matching
 * app/api/v1/routers/chat.py's `_sse_event` framing (data is JSON-encoded, so a
 * token containing newlines/quotes round-trips safely).
 */
export interface StreamChatCallbacks {
  onSession?: (sessionId: string) => void;
  onToken?: (token: string) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

export async function streamChat(
  request: { sessionId?: string; message: string },
  callbacks: StreamChatCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await keycloak.updateToken(30);
  } catch {
    keycloak.login();
    return;
  }

  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${keycloak.token}`,
      },
      body: JSON.stringify({ session_id: request.sessionId ?? null, message: request.message }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    callbacks.onError?.("Could not reach the server.");
    return;
  }

  if (!response.ok || !response.body) {
    callbacks.onError?.(`Request failed (HTTP ${response.status})`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // Set once an "error" or "done" SSE frame is actually parsed — lets the code
  // below tell "the stream ended because the server said so" apart from "the
  // stream ended/broke for some other reason" (e.g. a proxy or network layer
  // closing the connection mid-response: observed in practice as the browser
  // throwing on `reader.read()`, or the loop reaching `done: true` with no
  // terminal frame ever having arrived). Without this, either case left the
  // UI's "assistant is typing" indicator spinning forever — neither `onDone`
  // nor `onError` was ever called, so nothing ever cleared `isSending`.
  let terminated = false;

  function handleFrame(rawEvent: string): void {
    const eventType = parseEvent(rawEvent, callbacks);
    if (eventType === "done" || eventType === "error") terminated = true;
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex !== -1) {
        handleFrame(buffer.slice(0, separatorIndex));
        buffer = buffer.slice(separatorIndex + 2);
        separatorIndex = buffer.indexOf("\n\n");
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return; // caller already reset its own state
    if (!terminated) {
      callbacks.onError?.("Connection to the server was interrupted before the response finished.");
      callbacks.onDone?.();
    }
    return;
  }

  if (!terminated) {
    callbacks.onError?.("The response ended unexpectedly. Please try again.");
    callbacks.onDone?.();
  }
}

/** Parses one "event: X\ndata: Y" frame, invokes the matching callback, and
 * returns the event type so the caller can track whether a terminal frame
 * ("done"/"error") was actually seen. */
function parseEvent(rawEvent: string, callbacks: StreamChatCallbacks): string {
  let eventType = "message";
  let dataLine = "";
  for (const line of rawEvent.split("\n")) {
    if (line.startsWith("event:")) eventType = line.slice("event:".length).trim();
    else if (line.startsWith("data:")) dataLine = line.slice("data:".length).trim();
  }

  let data: string;
  try {
    data = JSON.parse(dataLine) as string;
  } catch {
    data = dataLine;
  }

  if (eventType === "session") callbacks.onSession?.(data);
  else if (eventType === "token") callbacks.onToken?.(data);
  else if (eventType === "error") callbacks.onError?.(data);
  else if (eventType === "done") callbacks.onDone?.();

  return eventType;
}
