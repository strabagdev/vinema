import { Suspense } from "react";
import { NoteDetailClient } from "@/app/notes/detail/note-detail-client";

export default function NoteDetailPage() {
  return (
    <Suspense fallback={<NoteDetailFallback />}>
      <NoteDetailClient />
    </Suspense>
  );
}

function NoteDetailFallback() {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
        Cargando captura...
      </div>
    </section>
  );
}
