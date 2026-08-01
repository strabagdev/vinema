"use client";

import {
  AlertCircle,
  Brain,
  Check,
  CircleDashed,
  Lightbulb,
  Link2,
  LoaderCircle,
  Sparkle,
} from "lucide-react";
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
  const service = useVisualFeedback();
  const [state, setState] = useState<VisualFeedbackState>(() =>
    service.getState(),
  );
  const visual = getVisualFeedbackPresentation(state.current);

  useEffect(() => service.subscribe(setState), [service]);

  return (
    <span
      className={cn(
        "relative inline-flex min-h-8 items-center gap-1.5 text-sm font-semibold tracking-normal transition-colors duration-200 motion-reduce:transition-none",
        visual.wordmarkClassName,
      )}
      data-feedback-wordmark=""
      data-feedback-kind={state.current?.kind ?? "idle"}
    >
      <span>Vinema</span>
      {visual.Icon ? (
        <span
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full transition-[opacity,transform,color] duration-200 motion-reduce:transition-none",
            visual.iconClassName,
          )}
          aria-hidden="true"
        >
          <visual.Icon
            className={cn(
              "h-3.5 w-3.5",
              visual.spin ? "animate-spin motion-reduce:animate-none" : null,
              visual.pulse ? "animate-pulse motion-reduce:animate-none" : null,
            )}
          />
        </span>
      ) : null}
      {state.current?.kind === "error" && state.current.message ? (
        <span className="hidden max-w-[18rem] truncate text-xs font-medium text-red-700 sm:inline">
          {state.current.message}
        </span>
      ) : null}
    </span>
  );
}

function getVisualFeedbackPresentation(event: VisualFeedbackEvent | null) {
  if (!event) {
    return {
      Icon: null,
      accessibleText: "Vinema en reposo.",
      className: "",
      iconClassName: "",
      wordmarkClassName: "text-zinc-900",
      pulse: false,
      spin: false,
    };
  }

  const base = {
    accessibleText: event.accessibleText,
    pulse: false,
    spin: false,
  };

  switch (event.kind) {
    case "capture":
    case "success":
      return {
        ...base,
        Icon: Check,
        className: "border-violet-100 text-violet-400",
        iconClassName: "text-emerald-600",
        wordmarkClassName: "text-emerald-700",
        pulse: true,
      };
    case "saving":
      return {
        ...base,
        Icon: Sparkle,
        className: "border-violet-100 text-violet-400",
        iconClassName: "text-violet-500",
        wordmarkClassName: "text-violet-700",
        pulse: true,
      };
    case "concept":
      return {
        ...base,
        Icon: Brain,
        className: "border-indigo-100 text-indigo-400",
        iconClassName: "text-indigo-500",
        wordmarkClassName: "text-zinc-900",
      };
    case "idea":
      return {
        ...base,
        Icon: Lightbulb,
        className: "border-amber-100 text-amber-500",
        iconClassName: "text-amber-500",
        wordmarkClassName: "text-zinc-900",
      };
    case "relation":
      return {
        ...base,
        Icon: Link2,
        className: "border-sky-100 text-sky-500",
        iconClassName: "text-sky-500",
        wordmarkClassName: "text-zinc-900",
      };
    case "syncing":
      return {
        ...base,
        Icon: LoaderCircle,
        className: "border-amber-100 text-amber-500",
        iconClassName: "text-amber-500",
        wordmarkClassName: "text-zinc-900",
        spin: true,
      };
    case "synced":
      return {
        ...base,
        Icon: Check,
        className: "border-emerald-100 text-emerald-500",
        iconClassName: "text-emerald-500",
        wordmarkClassName: "text-zinc-900",
      };
    case "offline":
      return {
        ...base,
        Icon: CircleDashed,
        className: "border-zinc-200 text-zinc-400",
        iconClassName: "text-zinc-400",
        wordmarkClassName: "text-zinc-700",
      };
    case "error":
      return {
        ...base,
        Icon: AlertCircle,
        className: "border-red-100 text-red-600",
        iconClassName: "text-red-600",
        wordmarkClassName: "text-red-700",
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

  if (successfulRunFinished && showingSyncing) {
    service.dismissKind("syncing");
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
