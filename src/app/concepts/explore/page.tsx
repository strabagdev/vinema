import { Suspense } from "react";
import { ConceptKnowledgeExplorerClient } from "@/app/concepts/explore/concept-knowledge-explorer-client";

export default function ConceptKnowledgeExplorerPage() {
  return (
    <Suspense fallback={<ConceptKnowledgeExplorerFallback />}>
      <ConceptKnowledgeExplorerClient />
    </Suspense>
  );
}

function ConceptKnowledgeExplorerFallback() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <p className="text-sm text-zinc-500">Cargando conexiones...</p>
    </section>
  );
}
