"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const notConfigured = error.message?.startsWith("INTEGRATION_NOT_CONFIGURED");
  return (
    <main className="grid min-h-[60dvh] place-items-center p-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-xl font-semibold">{notConfigured ? "Configuration required · Beállítás szükséges" : "Something went wrong · Hiba történt"}</h1>
        <p className="mt-2 text-sm text-muted">{notConfigured ? error.message.split(":")[1] : error.digest}</p>
        <Button className="mt-6" variant="secondary" onClick={reset}>Retry · Újra</Button>
      </div>
    </main>
  );
}
