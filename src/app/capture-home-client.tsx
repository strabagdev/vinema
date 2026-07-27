"use client";

import { CaptureSurface } from "@/features/capture/capture-surface";
import { useVinemaContext } from "@/features/node/hooks/use-vinema-context";
import {
  contextRepository,
  nodeContextRelationRepository,
  nodeRepository,
  storageAdapter,
} from "@/infrastructure/repositories";

export function CaptureHomeClient() {
  const context = useVinemaContext();

  if (context.status === "loading") {
    return (
      <section className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          Cargando Base de Conocimiento...
        </div>
      </section>
    );
  }

  if (context.status === "error") {
    return (
      <section className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-red-200 bg-white p-6 text-sm text-red-600">
          {context.error}
        </div>
      </section>
    );
  }

  return (
    <CaptureSurface
      device={context.device}
      workspace={context.workspace}
      storage={storageAdapter}
      repositories={{
        contextRepository,
        nodeContextRelationRepository,
        nodeRepository,
      }}
    />
  );
}
