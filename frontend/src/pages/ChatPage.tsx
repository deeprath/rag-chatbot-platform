import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { getSessionMessages, listSessions } from "../api/chat";
import { streamChat } from "../api/sse";
import type { ChatMessageRead } from "../api/types";
import { ChatComposer } from "../components/chat/ChatComposer";
import { MessageBubble } from "../components/chat/MessageBubble";
import { SessionSidebar } from "../components/chat/SessionSidebar";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";

const AUTO_SPEAK_STORAGE_KEY = "rag-chatbot:auto-speak-replies";

function loadAutoSpeakPreference(): boolean {
  try {
    return localStorage.getItem(AUTO_SPEAK_STORAGE_KEY) === "true";
  } catch {
    // Private browsing / storage blocked — default to off rather than throw.
    return false;
  }
}

export function ChatPage() {
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [streamingAssistant, setStreamingAssistant] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(loadAutoSpeakPreference);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const { isSupported: ttsSupported, speak } = useSpeechSynthesis();

  useEffect(() => {
    try {
      localStorage.setItem(AUTO_SPEAK_STORAGE_KEY, String(autoSpeak));
    } catch {
      // Ignore — this is a convenience preference, not critical state.
    }
  }, [autoSpeak]);

  const sessionsQuery = useQuery({ queryKey: ["chat", "sessions"], queryFn: listSessions });

  const messagesQuery = useQuery({
    queryKey: ["chat", "messages", selectedSessionId],
    queryFn: () => getSessionMessages(selectedSessionId as string),
    // Not while sending: onSession sets selectedSessionId as soon as a *new* chat's
    // session id comes back, which would otherwise trigger an immediate refetch that
    // already includes the user message chat_service persisted before the LLM call —
    // duplicating it alongside the optimistic pendingUserMessage bubble below.
    enabled: selectedSessionId !== null && !isSending,
  });

  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [pendingUserMessage, streamingAssistant, messagesQuery.data]);

  const handleNewChat = () => {
    abortControllerRef.current?.abort();
    setSelectedSessionId(null);
    setPendingUserMessage(null);
    setStreamingAssistant(null);
    setIsSending(false);
  };

  const handleSend = (message: string) => {
    let activeSessionId = selectedSessionId;
    let failed = false;
    let fullResponse = "";
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setPendingUserMessage(message);
    setStreamingAssistant("");
    setIsSending(true);

    void streamChat(
      { sessionId: selectedSessionId ?? undefined, message },
      {
        onSession: (sessionId) => {
          activeSessionId = sessionId;
          setSelectedSessionId(sessionId);
        },
        onToken: (token) => {
          fullResponse += token;
          setStreamingAssistant((prev) => (prev ?? "") + token);
        },
        onError: (errorMessage) => {
          failed = true;
          setStreamingAssistant((prev) => `${prev ?? ""}\n\n⚠️ ${errorMessage}`);
        },
        onDone: () => {
          setIsSending(false);
          void queryClient.invalidateQueries({ queryKey: ["chat", "sessions"] });
          if (activeSessionId) {
            void queryClient.invalidateQueries({
              queryKey: ["chat", "messages", activeSessionId],
            });
          }
          // chat_service persists the user's message before it ever calls the LLM,
          // so it's in history either way — always drop the optimistic copy to
          // avoid it appearing twice once the invalidated query above refetches.
          setPendingUserMessage(null);
          // The assistant's reply, on the other hand, is only persisted on success
          // (chat_service adds it after the stream completes) — on failure there's
          // nothing in history yet, so keep the error text visible locally until
          // the next message is sent.
          if (!failed) {
            setStreamingAssistant(null);
            if (autoSpeak) speak(fullResponse);
          }
        },
      },
      controller.signal,
    );
  };

  const persistedMessages: ChatMessageRead[] = messagesQuery.data ?? [];
  const showEmptyState =
    selectedSessionId === null && persistedMessages.length === 0 && !pendingUserMessage;

  return (
    <div className="-m-6 flex h-[calc(100vh-57px)]">
      <SessionSidebar
        sessions={sessionsQuery.data ?? []}
        selectedSessionId={selectedSessionId}
        onSelect={(id) => {
          abortControllerRef.current?.abort();
          setSelectedSessionId(id);
          setPendingUserMessage(null);
          setStreamingAssistant(null);
          setIsSending(false);
        }}
        onNewChat={handleNewChat}
      />

      <div className="flex flex-1 flex-col">
        {ttsSupported && (
          <div className="flex justify-end border-b border-slate-100 px-6 py-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={autoSpeak}
                onChange={(e) => setAutoSpeak(e.target.checked)}
              />
              🔊 Read replies aloud
            </label>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-6">
          {showEmptyState ? (
            <div className="flex h-full items-center justify-center text-slate-400">
              Ask a question — the assistant will answer using any documents you've uploaded.
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              {persistedMessages.map((message) => (
                <MessageBubble key={message.id} role={message.role} content={message.content} />
              ))}
              {pendingUserMessage && (
                <MessageBubble role="user" content={pendingUserMessage} />
              )}
              {streamingAssistant !== null && (
                <MessageBubble role="assistant" content={streamingAssistant} pending />
              )}
              <div ref={scrollAnchorRef} />
            </div>
          )}
        </div>
        <div className="mx-auto w-full max-w-3xl">
          <ChatComposer disabled={isSending} onSend={handleSend} />
        </div>
      </div>
    </div>
  );
}
