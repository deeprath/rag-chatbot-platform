import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { getSessionMessages, listSessions } from "../api/chat";
import { streamChat } from "../api/sse";
import type { ChatMessageRead } from "../api/types";
import { ChatComposer } from "../components/chat/ChatComposer";
import { MessageBubble } from "../components/chat/MessageBubble";
import { SessionSidebar } from "../components/chat/SessionSidebar";
import { VoiceConversationOverlay } from "../components/chat/VoiceConversationOverlay";
import { useVoiceConversation } from "../hooks/useVoiceConversation";
import { useVoiceOutput } from "../hooks/useVoiceOutput";
import { useVoicePreferences } from "../hooks/useVoicePreferences";

export function ChatPage() {
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [streamingAssistant, setStreamingAssistant] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const { autoSpeak } = useVoicePreferences();
  const { speak } = useVoiceOutput();

  // handleSend is defined after this (it needs voiceConversation.active/
  // handleAssistantReply), but useVoiceConversation needs a callback that
  // calls handleSend — a ref breaks the circularity without restarting
  // recognition every render the way passing a fresh inline closure would.
  const handleSendRef = useRef<(message: string) => void>(() => {});
  const voiceConversation = useVoiceConversation((transcript) => handleSendRef.current(transcript));

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
            if (voiceConversation.active) {
              // Speaks the reply, then resumes listening for the next turn.
              void voiceConversation.handleAssistantReply(fullResponse);
            } else if (autoSpeak) {
              void speak(fullResponse);
            }
          }
        },
      },
      controller.signal,
    );
  };
  handleSendRef.current = handleSend;

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
          voiceConversation.stop();
          setSelectedSessionId(id);
          setPendingUserMessage(null);
          setStreamingAssistant(null);
          setIsSending(false);
        }}
        onNewChat={handleNewChat}
      />

      {voiceConversation.active && (
        <VoiceConversationOverlay
          phase={voiceConversation.phase}
          error={voiceConversation.error}
          lastTranscript={voiceConversation.lastTranscript}
          onStop={voiceConversation.stop}
        />
      )}

      <div className="flex flex-1 flex-col">
        {voiceConversation.isSupported && (
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-2">
            <span className="text-xs text-slate-500">
              {!voiceConversation.active && voiceConversation.error && (
                <span className="text-red-600">Voice conversation error: {voiceConversation.error}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => (voiceConversation.active ? voiceConversation.stop() : voiceConversation.start())}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                voiceConversation.active
                  ? "border-red-300 bg-red-50 text-red-600 hover:bg-red-100"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {voiceConversation.active ? "⏹️ Stop voice conversation" : "🎙️ Start voice conversation"}
            </button>
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
          <ChatComposer disabled={isSending || voiceConversation.active} onSend={handleSend} />
        </div>
      </div>
    </div>
  );
}
