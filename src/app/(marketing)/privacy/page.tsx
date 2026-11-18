import { getDictionary } from "@/lib/i18n";
import { Alert } from "@/components/ui";

export const metadata = { title: "Privacy" };

const content = {
  hu: [
    ["Milyen adatokat kezelünk", "Fiókadatok (név, e-mail, nyelv, időzóna), az általad rögzített hangfelvételek, átiratok, jegyzetek és feltöltött dokumentumok, valamint használati adatok (felhasznált percek, AI-kérések)."],
    ["Mire használjuk", "Kizárólag a szolgáltatás nyújtására: átírás, jegyzet- és gyakorlóanyag-készítés, számlázás és visszaélések megelőzése. A felvételeidet külön, kifejezett hozzájárulás nélkül nem használjuk AI-modellek tanítására."],
    ["Adatfeldolgozók", "Tárhely és adatbázis: Supabase. AI és átírás: Anthropic és/vagy OpenAI (a beállított szolgáltató). Fizetés: Stripe. Ezekkel adatfeldolgozói szerződés szükséges."],
    ["Felvételek és hozzájárulás", "Felvételt csak a tanár és az érintettek hozzájárulásával, az iskola szabályainak megfelelően készíthetsz. A felvételek privát tárolóban vannak, és csak te férsz hozzájuk."],
    ["Jogaid (GDPR)", "Hozzáférés, helyesbítés, törlés, adathordozhatóság és tiltakozás. Adataidat a Beállításokban letöltheted, a fiókodat ott törölheted."],
    ["Kiskorúak", "16 év alatti felhasználóknál a szülő vagy gondviselő hozzájárulása szükséges a helyi jogszabályok szerint."],
  ],
  en: [
    ["What we process", "Account data (name, email, language, time zone), the audio you record, transcripts, notes and uploaded documents, and usage data (minutes used, AI requests)."],
    ["Why", "Only to provide the service: transcription, notes and practice material, billing and abuse prevention. Your recordings are never used to train AI models without separate, explicit consent."],
    ["Processors", "Hosting and database: Supabase. AI and transcription: Anthropic and/or OpenAI (the configured provider). Payments: Stripe. Data processing agreements are required with each."],
    ["Recordings and consent", "Only record with the consent of your teacher and those affected, in line with your school's rules. Recordings are stored privately and only you can access them."],
    ["Your rights (GDPR)", "Access, rectification, erasure, portability and objection. Download your data or delete your account in Settings."],
    ["Minors", "Users under 16 need parent or guardian consent, depending on local law."],
  ],
} as const;

export default async function PrivacyPage() {
  const { locale, t } = await getDictionary();
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t.legal.privacyTitle}</h1>
      <Alert tone="warn" className="mt-6">{t.legal.draftNotice}</Alert>
      <div className="mt-8 space-y-8">
        {content[locale].map(([h, p]) => (
          <section key={h}>
            <h2 className="text-lg font-semibold">{h}</h2>
            <p className="mt-2 leading-relaxed text-muted">{p}</p>
          </section>
        ))}
        <section id="cookies" className="scroll-mt-24">
          <h2 className="text-lg font-semibold">{locale === "hu" ? "Sütik" : "Cookies"}</h2>
          <p className="mt-2 leading-relaxed text-muted">
            {locale === "hu"
              ? "Csak működéshez szükséges sütiket használunk: bejelentkezési munkamenet és nyelvi beállítás. Nem használunk hirdetési vagy követő sütiket, ezért ezekhez nem kell hozzájárulás."
              : "We only use strictly necessary cookies: your sign-in session and language preference. We use no advertising or tracking cookies, so no consent banner is required for them."}
          </p>
        </section>
      </div>
    </article>
  );
}
