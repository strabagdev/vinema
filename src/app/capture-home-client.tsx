"use client";

import { useEffect, useMemo, useState } from "react";
import { CaptureSurface } from "@/features/capture/capture-surface";
import {
  VinemaInitialLoading,
  type VinemaInitialLoadingStage,
} from "@/components/app-shell/vinema-initial-loading";
import { useAuth } from "@/features/auth/auth-provider";
import { useVinemaContext } from "@/features/node/hooks/use-vinema-context";
import { getSemanticSimilarityService } from "@/features/semantic-similarity/semantic-similarity-service";
import { useSemanticSimilarityIndexing } from "@/features/semantic-similarity/use-semantic-similarity-indexing";
import {
  createLocalSyncRepositorySet,
  storageAdapter,
} from "@/infrastructure/repositories";

export function CaptureHomeClient() {
  const auth = useAuth();
  const context = useVinemaContext();
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const workspaceId = context.status === "ready" ? context.workspace.id : null;
  const deviceId = context.status === "ready" ? context.device.id : null;
  const syncPhase = auth.syncState.phase;
  const syncing = syncPhase === "PUSHING" || syncPhase === "PULLING";
  const offlineConfirmed =
    auth.authStatus === "AUTHENTICATED_OFFLINE" ||
    auth.syncState.connectivity === "OFFLINE";
  const startupActive =
    !initialLoadComplete && (context.status === "loading" || syncing);
  const startupStage: VinemaInitialLoadingStage = offlineConfirmed
    ? "offline"
    : context.status === "loading"
      ? "local"
      : syncing
        ? "sync"
        : "ready";
  const repositories = useMemo(() => {
    if (!workspaceId || !deviceId) {
      return null;
    }

    return createLocalSyncRepositorySet({
      workspaceId,
      deviceId,
    });
  }, [deviceId, workspaceId]);

  useSemanticSimilarityIndexing({
    workspaceId: workspaceId ?? "",
    nodeRepository: repositories?.nodeRepository ?? null,
    contextRepository: repositories?.contextRepository ?? null,
    relationRepository: repositories?.nodeContextRelationRepository ?? null,
    enabled: Boolean(workspaceId && repositories),
  });

  useEffect(() => {
    if (context.status !== "ready" || syncing) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setInitialLoadComplete(true);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [context.status, syncing]);

  if (context.status === "error") {
    return (
      <VinemaInitialLoading active={false} stage="ready">
        <section className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-red-200 bg-white p-6 text-sm text-red-600">
            {context.error}
          </div>
        </section>
      </VinemaInitialLoading>
    );
  }

  if (context.status !== "ready") {
    return <VinemaInitialLoading active={startupActive} stage={startupStage} />;
  }

  if (!repositories) {
    return <VinemaInitialLoading active={startupActive} stage={startupStage} />;
  }

  return (
    <VinemaInitialLoading active={startupActive} stage={startupStage}>
      <CaptureSurface
        device={context.device}
        workspace={context.workspace}
        storage={storageAdapter}
        repositories={repositories}
        onCaptureCommitted={() => {
          void getSemanticSimilarityService(
            repositories.nodeRepository,
          ).backfillWorkspace(context.workspace.id, { limit: 2 });
          if (auth.authStatus === "AUTHENTICATED_ONLINE") {
            void auth.syncNow();
          }
        }}
      />
    </VinemaInitialLoading>
  );
}
