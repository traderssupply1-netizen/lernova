import { z } from "zod";
import { body, fail, json, route } from "@/lib/api";
import { chat, type ChatMessage } from "@/lib/ai/provider";
import { loadLessonSource, TUTOR_MODES, tutorSystemPrompt } from "@/lib/ai/study";
import { withAllowance } from "@/lib/quota";
import { rateLimit } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const schema = z.object({
  conversationId: z.uuid().nullable().optional(),
  message: z.string().trim().min(1).max(2000),
  mode: z.enum(TUTOR_MODES).default("simple"),
});

/** One tutor turn about a lesson (one AI request from the allowance). */
export const POST = route<{ id: string }>(async ({ user, req, params }) => {
  const d = await body(req, schema);
  if (!(await rateLimit(`tutor:${user.userId}`, 40, 3600))) return fail("RATE_LIMITED", 429);
  const src = await loadLessonSource(params.id, user.userId);
  if (!src) return fail("NO_MATERIAL", 409);
  const supabase = await createClient();

  let conversationId = d.conversationId ?? null;
  if (conversationId) {
    const { data } = await supabase.from("tutor_conversations").select("id").eq("id", conversationId).eq("lesson_id", src.id).maybeSingle();
    if (!data) return fail("NOT_FOUND", 404);
  }
  // Last 12 messages keep the context (and the cost) small.
  const { data: history } = conversationId
    ? await supabase.from("tutor_messages").select("role, content").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(12)
    : { data: [] as { role: string; content: string }[] };
  const messages: ChatMessage[] = [...(history ?? [])].reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  messages.push({ role: "user", content: d.message });

  const res = await withAllowance(user.userId, "ai_requests", 1, async () => {
    const { text, usage } = await chat({ system: tutorSystemPrompt(src, d.mode), messages, maxTokens: 1200 });
    return { value: text.trim(), costUsd: usage.costUsd, provider: usage.provider };
  });
  if (!res.ok) return fail("QUOTA_EXCEEDED", 402);

  if (!conversationId) {
    const { data: conv, error } = await supabase
      .from("tutor_conversations")
      .insert({ user_id: user.userId, lesson_id: src.id, mode: d.mode, title: d.message.slice(0, 80) })
      .select("id")
      .single();
    if (error) return fail("INTERNAL", 500);
    conversationId = conv.id as string;
  } else {
    await supabase.from("tutor_conversations").update({ mode: d.mode, updated_at: new Date().toISOString() }).eq("id", conversationId);
  }
  const now = Date.now();
  await supabase.from("tutor_messages").insert([
    { user_id: user.userId, conversation_id: conversationId, role: "user", content: d.message, created_at: new Date(now).toISOString() },
    { user_id: user.userId, conversation_id: conversationId, role: "assistant", content: res.value, created_at: new Date(now + 1).toISOString() },
  ]);
  return json({ conversationId, reply: res.value });
});

/** Starts over: deletes the lesson's tutor conversations. */
export const DELETE = route<{ id: string }>(async ({ params }) => {
  const supabase = await createClient();
  await supabase.from("tutor_conversations").delete().eq("lesson_id", params.id);
  return json({ ok: true });
});
