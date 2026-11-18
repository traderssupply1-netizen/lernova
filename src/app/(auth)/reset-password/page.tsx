import { redirect } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import { getSession } from "@/lib/auth";
import { ResetForm } from "../auth-forms";

export const metadata = { title: "New password" };

export default async function ResetPage() {
  // Reached through the recovery link, which signs the user in first.
  if (!(await getSession())) redirect("/forgot-password");
  const { t } = await getDictionary();
  return <ResetForm t={t.auth} />;
}
