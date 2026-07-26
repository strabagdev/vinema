import { Suspense } from "react";
import { ContextDetailClient } from "@/app/contexts/detail/context-detail-client";

export default function ContextDetailPage() {
  return (
    <Suspense fallback={<ContextDetailFallback />}>
      <ContextDetailClient />
    </Suspense>
  );
}

function ContextDetailFallback() {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
        Cargando contexto...
      </div>
    </section>
  );
}
