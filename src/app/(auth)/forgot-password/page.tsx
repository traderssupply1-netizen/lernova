import { getDictionary } from "@/lib/i18n";
import { ForgotForm } from "../auth-forms";

export const metadata = { title: "Reset password" };

export default async function ForgotPage() {
  const { t } = await getDictionary();
  return <ForgotForm t={t.auth} />;
}
