import { Suspense } from "react";
import { ArchiveClient } from "@/app/notes/archive/archive-client";

export default function MemoryArchivePage() {
  return (
    <Suspense fallback={<MemoryArchiveFallback />}>
      <ArchiveClient />
    </Suspense>
  );
}

function MemoryArchiveFallback() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
        Cargando Archivo...
      </div>
    </section>
  );
}
