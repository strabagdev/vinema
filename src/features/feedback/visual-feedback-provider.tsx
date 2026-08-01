"use client";

import {
  AlertCircle,
  Brain,
  Check,
  Circle,
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
  const previousSyncPhaseRef = useRef<SyncState["phase"] | null>(null);
  const [state, setState] = useState<VisualFeedbackState>(() =>
    service.getState(),
  );

  useEffect(() => service.subscribe(setState), [service]);
  useEffect(() => {
    bindSyncStateToFeedback(service, syncState, previousSyncPhaseRef.current);
    previousSyncPhaseRef.current = syncState.phase;
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

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-16 z-50 flex w-full -translate-x-1/2 justify-center px-4 sm:top-[4.25rem]"
      aria-live="polite"
      aria-atomic="true"
      data-visual-feedback-viewport=""
    >
      <VisualFeedbackPulse event={state.current} />
    </div>
  );
}

export function createTestVisualFeedbackService() {
  return createVisualFeedbackService();
}

function VisualFeedbackPulse({ event }: { event: VisualFeedbackEvent | null }) {
  const visual = getVisualFeedbackPresentation(event);

  return (
    <div
      className={cn(
        "flex min-h-9 min-w-9 items-center justify-center rounded-full border bg-white/85 shadow-[0_8px_24px_rgba(24,24,27,0.08)] backdrop-blur-sm transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
        event ? "scale-100 opacity-100" : "scale-95 opacity-0",
        visual.className,
      )}
      role={event?.kind === "error" ? "alert" : "status"}
      data-feedback-kind={event?.kind ?? "idle"}
    >
      <visual.Icon
        className={cn(
          "h-4 w-4",
          visual.spin ? "animate-spin motion-reduce:animate-none" : null,
          visual.pulse ? "animate-pulse motion-reduce:animate-none" : null,
        )}
        aria-hidden="true"
      />
      <span className="sr-only">{visual.accessibleText}</span>
      {event?.kind === "error" && event.message ? (
        <span className="ml-2 max-w-[min(80vw,26rem)] text-sm font-medium text-red-700">
          {event.message}
        </span>
      ) : null}
    </div>
  );
}

function getVisualFeedbackPresentation(event: VisualFeedbackEvent | null) {
  if (!event) {
    return {
      Icon: Circle,
      accessibleText: "Vinema en reposo.",
      className: "border-zinc-200 text-zinc-300",
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
    case "saving":
      return {
        ...base,
        Icon: Sparkle,
        className: "border-violet-100 text-violet-400",
        pulse: true,
      };
    case "concept":
      return {
        ...base,
        Icon: Brain,
        className: "border-indigo-100 text-indigo-400",
      };
    case "idea":
      return {
        ...base,
        Icon: Lightbulb,
        className: "border-amber-100 text-amber-500",
      };
    case "relation":
      return {
        ...base,
        Icon: Link2,
        className: "border-sky-100 text-sky-500",
      };
    case "syncing":
      return {
        ...base,
        Icon: LoaderCircle,
        className: "border-amber-100 text-amber-500",
        spin: true,
      };
    case "synced":
      return {
        ...base,
        Icon: Check,
        className: "border-emerald-100 text-emerald-500",
      };
    case "offline":
      return {
        ...base,
        Icon: CircleDashed,
        className: "border-zinc-200 text-zinc-400",
      };
    case "error":
      return {
        ...base,
        Icon: AlertCircle,
        className: "border-red-100 text-red-600",
      };
  }
}

function bindSyncStateToFeedback(
  service: VisualFeedbackService,
  syncState: SyncState,
  previousPhase: SyncState["phase"] | null,
) {
  if (syncState.connectivity === "OFFLINE") {
    service.offline();
    return;
  }

  if (syncState.phase === "PUSHING" || syncState.phase === "PULLING") {
    service.syncing();
    return;
  }

  if (syncState.phase === "SUCCESS" && previousPhase !== "SUCCESS") {
    service.dismissKind("syncing");
    service.synced();
    return;
  }

  if (syncState.phase === "ERROR" && syncState.lastError) {
    service.error(syncState.lastError.message);
  }
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
