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

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      handleEvent(buffer.slice(0, separatorIndex), callbacks);
      buffer = buffer.slice(separatorIndex + 2);
      separatorIndex = buffer.indexOf("\n\n");
    }
  }
}

function handleEvent(rawEvent: string, callbacks: StreamChatCallbacks): void {
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
}
