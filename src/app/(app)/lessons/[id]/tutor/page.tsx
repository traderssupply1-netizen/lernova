import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { buttonClass, PageHeader } from "@/components/ui";
import { TutorChat } from "./tutor-chat";

export const metadata = { title: "AI tutor" };

export default async function TutorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/lessons/${id}/tutor`);
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { data: lesson } = await supabase.from("lessons").select("id, title").eq("id", id).maybeSingle();
  if (!lesson) notFound();
  const { data: conv } = await supabase
    .from("tutor_conversations")
    .select("id, mode")
    .eq("lesson_id", id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: messages } = conv
    ? await supabase.from("tutor_messages").select("id, role, content").eq("conversation_id", conv.id).order("created_at").limit(100)
    : { data: [] };

  return (
    <>
      <PageHeader
        title={t.study.tutor}
        subtitle={lesson.title}
        actions={<Link href={`/lessons/${id}`} className={buttonClass("ghost", "sm")}>{t.study.backToLesson}</Link>}
      />
      <TutorChat
        t={t}
        lessonId={id}
        initialConversationId={conv?.id ?? null}
        initialMode={(conv?.mode as "simple" | "detailed" | "exam_prep" | "practice") ?? "simple"}
        initialMessages={(messages ?? []).map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content }))}
      />
    </>
  );
}
