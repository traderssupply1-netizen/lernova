import { Skeleton } from "@/components/ui";

/** Shown instantly on navigation while the server renders the next page. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-3 h-4 w-72" />
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}
