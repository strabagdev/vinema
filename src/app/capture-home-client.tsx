"use client";

import { useMemo } from "react";
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
  const workspaceId = context.status === "ready" ? context.workspace.id : null;
  const deviceId = context.status === "ready" ? context.device.id : null;
  const repositories = useMemo(() => {
    if (!workspaceId || !deviceId) {
      return null;
    }

    return createLocalSyncRepositorySet({
      workspaceId,
      deviceId,
    });
  }, [deviceId, workspaceId]);

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

  if (!repositories) {
    return null;
  }

  return (
    <CaptureSurface
      device={context.device}
      workspace={context.workspace}
      storage={storageAdapter}
      repositories={repositories}
      onCaptureCommitted={() => {
        if (auth.authStatus === "AUTHENTICATED_ONLINE") {
          void auth.syncNow();
        }
      }}
    />
  );
}
