import { z } from "zod";
import { body, fail, json, route } from "@/lib/api";
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from "@/lib/documents/extract";
import { remaining } from "@/lib/quota";
import { rateLimit } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string(),
  size: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
  subjectId: z.uuid().nullable().optional(),
});

/** Step 1: registers a document and returns a signed URL to upload it directly to private storage. */
export const POST = route(async ({ user, req }) => {
  const d = await body(req, schema);
  const ext = DOCUMENT_TYPES[d.mimeType];
  if (!ext) return fail("UNSUPPORTED_TYPE", 415);
  if (!(await rateLimit(`docs:${user.userId}`, 20, 3600))) return fail("RATE_LIMITED", 429);
  if ((await remaining(user.userId, "document_uploads")) < 1) return fail("QUOTA_EXCEEDED", 402);

  const supabase = await createClient();
  const id = crypto.randomUUID();
  const path = `${user.userId}/${id}/document.${ext}`;
  const { error } = await supabase.from("documents").insert({
    id,
    user_id: user.userId,
    subject_id: d.subjectId ?? null,
    file_name: d.fileName,
    mime_type: d.mimeType,
    size_bytes: d.size,
    storage_path: path,
    status: "uploaded",
  });
  if (error) return fail("INTERNAL", 500);
  const { data, error: signError } = await supabase.storage.from("documents").createSignedUploadUrl(path);
  if (signError) return fail("SIGN_FAILED", 500);
  return json({ documentId: id, path, token: data.token });
});
