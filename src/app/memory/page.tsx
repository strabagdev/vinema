import { Suspense } from "react";
import { KnowledgeBaseClient } from "@/app/notes/knowledge-base-client";

export default function MemoryPage() {
  return (
    <Suspense fallback={<MemoryFallback />}>
      <KnowledgeBaseClient />
    </Suspense>
  );
}

function MemoryFallback() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
        Cargando Memoria...
      </div>
    </section>
  );
}
