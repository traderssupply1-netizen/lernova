import "server-only";
import { cookies, headers } from "next/headers";
import { en } from "./en";
import { hu, type Dictionary } from "./hu";

export type Locale = "hu" | "en";
export const LOCALE_COOKIE = "lernova_locale";
const dictionaries: Record<Locale, Dictionary> = { hu, en };

export function isLocale(v: unknown): v is Locale {
  return v === "hu" || v === "en";
}

/** Cookie (kept in sync with the profile setting) > Accept-Language > Hungarian. */
export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  const al = (await headers()).get("accept-language") ?? "";
  return al.toLowerCase().startsWith("hu") ? "hu" : al ? "en" : "hu";
}

export async function getDictionary() {
  const locale = await getLocale();
  return { locale, t: dictionaries[locale] };
}

export function getDictionaryFor(locale: Locale) {
  return dictionaries[locale];
}
