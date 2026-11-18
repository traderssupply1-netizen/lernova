"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/hu";
import { renderMarkdown } from "@/lib/markdown";
import { api, ApiError } from "@/lib/recorder/uploader";
import { Alert, Button, Card, Textarea, cn } from "@/components/ui";

type Mode = "simple" | "detailed" | "exam_prep" | "practice";
type Msg = { id: string; role: "user" | "assistant"; content: string };

function Bubble({ m }: { m: Msg }) {
  const html = useMemo(() => (m.role === "assistant" ? renderMarkdown(m.content) : null), [m]);
  return (
    <div className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed", m.role === "user" ? "bg-lime text-lime-ink" : "bg-ink-800 text-fg")}>
        {html ? <div className="prose-notes prose-chat" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="whitespace-pre-line">{m.content}</p>}
      </div>
    </div>
  );
}

export function TutorChat({
  t,
  lessonId,
  initialConversationId,
  initialMode,
  initialMessages,
}: {
  t: Dictionary;
  lessonId: string;
  initialConversationId: string | null;
  initialMode: Mode;
  initialMessages: Msg[];
}) {
  const S = t.study;
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    setError(null);
    setSending(true);
    setInput("");
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: message }]);
    try {
      const r = await api<{ conversationId: string; reply: string }>(`/api/lessons/${lessonId}/tutor`, { method: "POST", json: { conversationId, message, mode } });
      setConversationId(r.conversationId);
      setMessages((m) => [...m, { id: `reply-${Date.now()}`, role: "assistant", content: r.reply }]);
    } catch (e) {
      setMessages((m) => m.slice(0, -1));
      setInput(message);
      setError(e instanceof ApiError && e.code === "QUOTA_EXCEEDED" ? S.quotaExceeded : e instanceof ApiError && e.code === "RATE_LIMITED" ? S.slowDown : t.common.somethingWrong);
    } finally {
      setSending(false);
    }
  }

  async function reset() {
    await api(`/api/lessons/${lessonId}/tutor`, { method: "DELETE" }).catch(() => undefined);
    setConversationId(null);
    setMessages([]);
  }

  const modes: Mode[] = ["simple", "detailed", "exam_prep", "practice"];

  return (
    <div className="flex min-h-[60dvh] flex-col">
      <div className="flex flex-wrap items-center gap-1.5">
        {modes.map((m) => (
          <Button key={m} size="sm" variant={mode === m ? "secondary" : "ghost"} onClick={() => setMode(m)}>{S.modes[m]}</Button>
        ))}
        {messages.length > 0 && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={reset} aria-label={S.newChat}><Trash2 className="size-4" aria-hidden /> {S.newChat}</Button>
        )}
      </div>

      <Card className="mt-3 flex-1 space-y-3 p-4 sm:p-5">
        {messages.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-muted">{S.tutorEmpty}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {S.suggestions.map((q) => (
                <button key={q} type="button" onClick={() => send(q)} className="rounded-full border border-ink-600 bg-ink-850 px-3 py-1.5 text-sm hover:bg-ink-800">{q}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => <Bubble key={m.id} m={m} />)}
        {sending && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" aria-hidden /> {S.thinking}</p>}
        <div ref={endRef} />
      </Card>

      {error && <Alert tone="warn" className="mt-3">{error}</Alert>}
      <form
        className="sticky bottom-24 mt-3 flex gap-2 md:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder={S.askPlaceholder}
          className="min-h-11 flex-1 resize-none text-sm"
          aria-label={S.askPlaceholder}
        />
        <Button type="submit" disabled={!input.trim() || sending} aria-label={S.send}><Send className="size-4" aria-hidden /></Button>
      </form>
      <p className="mt-2 text-xs text-subtle">{S.tutorDisclaimer}</p>
    </div>
  );
}
