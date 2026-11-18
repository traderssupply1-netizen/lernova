import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { Recorder } from "./recorder";

export const metadata = { title: "Record" };

export default async function RecordPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  await requireUser("/record");
  const { t } = await getDictionary();
  const { subject } = await searchParams;
  const supabase = await createClient();
  const { data: subjects } = await supabase.from("subjects").select("id, name").eq("archived", false).order("name");
  return (
    <>
      <PageHeader title={t.recorder.title} />
      <Recorder t={t.recorder} subjects={subjects ?? []} initialSubject={subject} />
    </>
  );
}
