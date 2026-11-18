import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { getLocale } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LERNOVA — Turn Every Lesson Into Knowledge", template: "%s · LERNOVA" },
  description: "AI study assistant: record lessons, get transcripts, structured notes, flashcards and practice exams.",
  applicationName: "LERNOVA",
  appleWebApp: { capable: true, title: "LERNOVA", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#08090a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
