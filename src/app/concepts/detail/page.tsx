import { Suspense } from "react";
import { ConceptExplorationClient } from "@/app/concepts/detail/concept-exploration-client";

export default function ConceptDetailPage() {
  return (
    <Suspense fallback={<ConceptExplorationFallback />}>
      <ConceptExplorationClient />
    </Suspense>
  );
}

function ConceptExplorationFallback() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <p className="text-sm text-zinc-500">Cargando exploracion...</p>
    </section>
  );
}
