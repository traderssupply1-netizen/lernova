import { getDictionary } from "@/lib/i18n";
import { LoginForm } from "../auth-forms";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { t } = await getDictionary();
  const { next, error } = await searchParams;
  return <LoginForm t={t.auth} next={next} initialError={error} />;
}
