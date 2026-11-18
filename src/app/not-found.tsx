import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="font-mono text-sm text-lime">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Not found · Nem található</h1>
        <Link href="/" className={buttonClass("secondary", "md", "mt-6")}>LERNOVA</Link>
      </div>
    </main>
  );
}
