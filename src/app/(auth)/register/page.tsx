import { getDictionary } from "@/lib/i18n";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Register" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { t } = await getDictionary();
  const { code } = await searchParams;
  return <RegisterForm t={t.auth} initialCode={code?.slice(0, 40) ?? ""} />;
}
