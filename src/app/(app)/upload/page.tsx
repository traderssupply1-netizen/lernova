import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { UploadForm } from "./upload-form";

export const metadata = { title: "Upload" };

export default async function UploadPage() {
  await requireUser("/upload");
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { data: allowance } = await supabase.rpc("my_allowance");
  const left = Number((allowance as Record<string, { left: number }> | null)?.document_uploads?.left ?? 0);
  return (
    <>
      <PageHeader title={t.study.uploadTitle} subtitle={t.study.uploadSubtitle} />
      <UploadForm t={t} left={left} />
    </>
  );
}
