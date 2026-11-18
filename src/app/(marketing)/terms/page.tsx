import { getDictionary } from "@/lib/i18n";
import { Alert } from "@/components/ui";

export const metadata = { title: "Terms" };

const content = {
  hu: [
    ["A szolgáltatás", "A LERNOVA AI-alapú tanulási asszisztens. Az AI által készített anyagok hibát tartalmazhatnak; mindig ellenőrizd őket az eredeti forrással."],
    ["Fiók és meghívó", "A regisztráció jelenleg meghívókóddal lehetséges. A fiókodért és a jelszavad biztonságáért te felelsz."],
    ["Felvételek", "Kizárólag hozzájárulással és a vonatkozó szabályok betartásával rögzíthetsz. Titkos felvétel készítése tilos, és a fiók felfüggesztését vonhatja maga után."],
    ["Előfizetés", "A fizetős csomagok havonta vagy évente megújulnak, és bármikor lemondhatók a periódus végére. Az árak és keretek változhatnak; erről előre értesítünk."],
    ["Elfogadható használat", "Tilos a szolgáltatás automatizált túlterhelése, más adataihoz való hozzáférés kísérlete és jogsértő tartalom feltöltése."],
  ],
  en: [
    ["The service", "LERNOVA is an AI study assistant. AI-generated material can contain mistakes; always check it against the original source."],
    ["Accounts and invitations", "Registration currently requires an invitation code. You are responsible for your account and password security."],
    ["Recordings", "Record only with consent and in line with applicable rules. Secret recording is prohibited and may lead to suspension."],
    ["Subscriptions", "Paid plans renew monthly or annually and can be cancelled at any time, effective at the end of the period. Prices and limits may change with advance notice."],
    ["Acceptable use", "Do not overload the service with automation, attempt to access other users' data, or upload unlawful content."],
  ],
} as const;

export default async function TermsPage() {
  const { locale, t } = await getDictionary();
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t.legal.termsTitle}</h1>
      <Alert tone="warn" className="mt-6">{t.legal.draftNotice}</Alert>
      <div className="mt-8 space-y-8">
        {content[locale].map(([h, p]) => (
          <section key={h}>
            <h2 className="text-lg font-semibold">{h}</h2>
            <p className="mt-2 leading-relaxed text-muted">{p}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
