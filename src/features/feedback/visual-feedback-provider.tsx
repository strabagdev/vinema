"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/features/auth/auth-provider";
import type { SyncState } from "@/features/sync/sync-state-engine";
import {
  createVisualFeedbackService,
  getDefaultVisualFeedbackService,
  type VisualFeedbackEvent,
  type VisualFeedbackService,
  type VisualFeedbackState,
} from "@/features/feedback/visual-feedback-service";
import { VinemaBrandMark } from "@/components/brand/vinema-brand";
import { cn } from "@/lib/cn";

const VisualFeedbackContext = createContext<VisualFeedbackService | null>(null);
const DEFENSIVE_SYNCING_TIMEOUT_MS = 15_000;

export function VisualFeedbackProvider({
  children,
  service,
}: {
  children?: React.ReactNode;
  service?: VisualFeedbackService;
}) {
  const value = useMemo(
    () => service ?? getDefaultVisualFeedbackService(),
    [service],
  );

  return (
    <VisualFeedbackContext.Provider value={value}>
      {children}
    </VisualFeedbackContext.Provider>
  );
}

export function useVisualFeedback() {
  const value = useContext(VisualFeedbackContext);
  return value ?? getDefaultVisualFeedbackService();
}

export function VisualFeedbackViewport() {
  const service = useVisualFeedback();
  const { syncState } = useAuth();
  const previousSyncStateRef = useRef<SyncState | null>(null);
  const [state, setState] = useState<VisualFeedbackState>(() =>
    service.getState(),
  );

  useEffect(() => service.subscribe(setState), [service]);
  useEffect(() => {
    bindSyncStateToFeedback(service, syncState, previousSyncStateRef.current);
    previousSyncStateRef.current = syncState;
  }, [service, syncState]);
  useEffect(() => bindOnlineStatusToFeedback(service), [service]);

  useEffect(() => {
    const current = state.current;

    if (!current || current.persistent) {
      return;
    }

    const timer = setTimeout(() => {
      service.dismissCurrent();
    }, current.durationMs);

    return () => {
      clearTimeout(timer);
    };
  }, [service, state]);

  useEffect(() => {
    if (state.current?.kind !== "syncing") {
      return;
    }

    const timer = setTimeout(() => {
      service.dismissKind("syncing");
    }, DEFENSIVE_SYNCING_TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [service, state]);

  return (
    <div
      className="sr-only"
      aria-live="polite"
      aria-atomic="true"
      data-visual-feedback-viewport=""
      data-feedback-kind={state.current?.kind ?? "idle"}
      role={state.current?.kind === "error" ? "alert" : "status"}
    >
      {getAccessibleFeedbackText(state.current)}
    </div>
  );
}

export function createTestVisualFeedbackService() {
  return createVisualFeedbackService();
}

export function VisualFeedbackWordmark() {
  return (
    <span
      className="relative inline-flex min-h-8 items-center gap-1.5 text-sm font-semibold tracking-normal text-zinc-900 transition-colors duration-200 motion-reduce:transition-none"
      data-feedback-wordmark=""
      data-feedback-kind="identity"
    >
      <VinemaBrandMark asset="monogram" className="h-6 w-7" decorative />
    </span>
  );
}

export function VisualFeedbackPulse() {
  const service = useVisualFeedback();
  const [state, setState] = useState<VisualFeedbackState>(() =>
    service.getState(),
  );
  const pulse = getPulsePresentation(state.current);

  useEffect(() => service.subscribe(setState), [service]);

  return (
    <div
      className={cn(
        "group inline-flex h-7 max-w-[9rem] items-center justify-center overflow-hidden rounded-full text-xs font-medium text-zinc-500 transition-[color,opacity] duration-200 motion-reduce:transition-none",
        pulse.active ? "text-zinc-700" : "text-zinc-400",
      )}
      role="status"
      aria-label={pulse.label}
      title={pulse.label}
      data-canvas-pulse=""
      data-visual-feedback-pulse=""
      data-feedback-kind={state.current?.kind ?? "idle"}
    >
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none",
          pulse.active ? "bg-amber-500" : "bg-emerald-500",
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          "ml-0 max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,margin] duration-200 group-hover:ml-2 group-hover:max-w-[8rem] group-hover:opacity-100 motion-reduce:transition-none",
          pulse.active ? "ml-2 max-w-[8rem] opacity-100" : "",
        )}
      >
        {pulse.label}
      </span>
    </div>
  );
}

function getPulsePresentation(event: VisualFeedbackEvent | null) {
  if (!event) {
    return { active: false, label: "Sincronizado" };
  }

  switch (event.kind) {
    case "error":
      return { active: true, label: event.message ?? "Requiere atencion" };
    case "offline":
      return { active: true, label: "Trabajando sin conexion" };
    case "syncing":
      return { active: true, label: "Sincronizando..." };
    case "saving":
      return { active: true, label: "Guardando..." };
    case "capture":
    case "success":
    case "concept":
    case "idea":
    case "relation":
    case "synced":
      return {
        active: true,
        label: event.message ?? event.accessibleText,
      };
  }
}

function getAccessibleFeedbackText(event: VisualFeedbackEvent | null) {
  if (!event) {
    return "";
  }

  return event.message ?? event.accessibleText;
}

function bindSyncStateToFeedback(
  service: VisualFeedbackService,
  syncState: SyncState,
  previousState: SyncState | null,
) {
  const state = service.getState();
  const showingSyncing = [state.current, ...state.queue].some(
    (event) => event?.kind === "syncing",
  );
  const successfulRunFinished =
    syncState.lastSuccessfulSyncAt !== null &&
    syncState.lastSuccessfulSyncAt !== previousState?.lastSuccessfulSyncAt;
  const reconnectedSincePrevious =
    previousState?.connectivity === "OFFLINE" &&
    syncState.connectivity === "ONLINE";

  if (
    syncState.connectivity === "ONLINE" ||
    syncState.authentication === "AUTHENTICATED_ONLINE"
  ) {
    service.dismissKind("offline");
  }

  if (previousState?.lastError && !syncState.lastError) {
    service.dismissKind("error");
  }

  if (syncState.connectivity === "OFFLINE") {
    service.dismissKind("syncing");
    service.offline();
    return;
  }

  if (syncState.phase === "ERROR" && syncState.lastError) {
    service.dismissKind("syncing");
    service.error(syncState.lastError.message);
    return;
  }

  if (syncState.phase === "PUSHING" || syncState.phase === "PULLING") {
    if (hasVisibleSyncWork(syncState)) {
      service.syncing();
      return;
    }

    service.dismissKind("syncing");
    return;
  }

  if (
    successfulRunFinished &&
    (showingSyncing ||
      hasPreviousVisibleSyncWork(previousState) ||
      reconnectedSincePrevious)
  ) {
    service.dismissKind("syncing");
    service.dismissKind("offline");
    service.synced();
    return;
  }

  if (
    syncState.phase === "IDLE" ||
    syncState.phase === "WAITING" ||
    syncState.phase === "SUCCESS" ||
    syncState.phase === "CANCELLED"
  ) {
    service.dismissKind("syncing");
  }
}

function hasVisibleSyncWork(syncState: SyncState) {
  return syncState.pendingMutations > 0 || syncState.processingMutations > 0;
}

function hasPreviousVisibleSyncWork(syncState: SyncState | null) {
  return syncState ? hasVisibleSyncWork(syncState) : false;
}

function bindOnlineStatusToFeedback(service: VisualFeedbackService) {
  if (typeof navigator === "undefined") {
    return;
  }

  function updateOnlineStatus() {
    if (navigator.onLine) {
      service.dismissKind("offline");
      return;
    }

    service.offline();
  }

  updateOnlineStatus();
  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);

  return () => {
    window.removeEventListener("online", updateOnlineStatus);
    window.removeEventListener("offline", updateOnlineStatus);
  };
}
