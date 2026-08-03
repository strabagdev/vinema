"use client";

import { CaptureSurface } from "@/features/capture/capture-surface";
import { useAuth } from "@/features/auth/auth-provider";
import { useVinemaContext } from "@/features/node/hooks/use-vinema-context";
import {
  createLocalSyncRepositorySet,
  storageAdapter,
} from "@/infrastructure/repositories";

export function CaptureHomeClient() {
  const auth = useAuth();
  const context = useVinemaContext();

  if (context.status === "loading") {
    return (
      <section className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          Cargando Memoria...
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
      repositories={createLocalSyncRepositorySet({
        workspaceId: context.workspace.id,
        deviceId: context.device.id,
      })}
      onCaptureCommitted={() => {
        if (auth.authStatus === "AUTHENTICATED_ONLINE") {
          void auth.syncNow();
        }
      }}
    />
  );
}
