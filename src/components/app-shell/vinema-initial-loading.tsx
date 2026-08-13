"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { VinemaBrandMark } from "@/components/brand/vinema-brand";
import { cn } from "@/lib/cn";

export type VinemaInitialLoadingStage =
  | "auth"
  | "local"
  | "sync"
  | "ready"
  | "offline";

const LOADING_STAGES = {
  auth: {
    message: "Preparando tu espacio",
    progress: 25,
  },
  local: {
    message: "Abriendo tu memoria",
    progress: 55,
  },
  sync: {
    message: "Sincronizando cambios",
    progress: 85,
  },
  ready: {
    message: "Listo",
    progress: 100,
  },
  offline: {
    message: "Trabajando desde tu memoria local",
    progress: 55,
  },
} satisfies Record<
  VinemaInitialLoadingStage,
  { message: string; progress: number }
>;

const SHOW_DELAY_MS = 180;
const MIN_VISIBLE_MS = 350;
const EXIT_MS = 160;

type VisibilityState = "hidden" | "visible" | "exiting";

export function VinemaInitialLoading({
  active = true,
  stage = "local",
  children,
  className,
}: {
  active?: boolean;
  stage?: VinemaInitialLoadingStage;
  children?: ReactNode;
  className?: string;
}) {
  const [visibility, setVisibility] = useState<VisibilityState>("hidden");
  const visibleSinceRef = useRef<number | null>(null);
  const [maxProgress, setMaxProgress] = useState(LOADING_STAGES[stage].progress);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setMaxProgress((current) =>
        Math.max(current, LOADING_STAGES[stage].progress),
      );
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [active, stage]);

  useEffect(() => {
    if (active) {
      if (visibility === "visible") {
        return undefined;
      }

      if (visibility === "exiting") {
        const resumeTimer = window.setTimeout(() => {
          visibleSinceRef.current = Date.now();
          setVisibility("visible");
        }, 0);

        return () => {
          window.clearTimeout(resumeTimer);
        };
      }

      let cancelled = false;
      const timer = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        visibleSinceRef.current = Date.now();
        setVisibility("visible");
      }, SHOW_DELAY_MS);

      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    if (visibility === "hidden") {
      const resetTimer = window.setTimeout(() => {
        setMaxProgress(LOADING_STAGES[stage].progress);
      }, 0);

      return () => {
        window.clearTimeout(resetTimer);
      };
    }

    const elapsed = visibleSinceRef.current === null
      ? MIN_VISIBLE_MS
      : Date.now() - visibleSinceRef.current;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    const exitTimer = window.setTimeout(() => {
      setVisibility("exiting");
    }, wait);
    const hiddenTimer = window.setTimeout(() => {
      setVisibility("hidden");
      visibleSinceRef.current = null;
      setMaxProgress(LOADING_STAGES[stage].progress);
    }, wait + EXIT_MS);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(hiddenTimer);
    };
  }, [active, stage, visibility]);

  const visualStage = useMemo(() => {
    if (!active && visibility !== "hidden") {
      return LOADING_STAGES.ready;
    }

    const currentStage = LOADING_STAGES[stage];

    return {
      ...currentStage,
      progress: Math.max(maxProgress, currentStage.progress),
    };
  }, [active, maxProgress, stage, visibility]);

  return (
    <>
      {children}
      {visibility !== "hidden" ? (
        <div
          className={cn(
            "fixed inset-0 z-[100] flex min-h-dvh items-center justify-center bg-[var(--vinema-surface-background)] text-[var(--vinema-text-primary)]",
            visibility === "exiting" && "vinema-initial-loading-exit",
            className,
          )}
          aria-label="Vinema"
          data-vinema-initial-loading=""
          data-vinema-initial-loading-stage={active ? stage : "ready"}
          data-vinema-initial-loading-theme="semantic"
          data-vinema-initial-loading-motion="reduced-safe"
        >
          <div className="flex w-full flex-col items-center justify-center gap-4 px-6">
            <VinemaBrandMark
              asset="monogram"
              className="vinema-initial-loading-logo h-7 w-8"
              decorative
            />
            <div className="flex w-[min(13.75rem,calc(100vw-3rem))] flex-col items-center gap-2">
              <p
                className="text-center text-xs font-medium text-[var(--vinema-text-muted)] transition-opacity"
                data-vinema-initial-loading-message=""
              >
                {visualStage.message}
              </p>
              <div
                className="h-1 w-full overflow-hidden rounded-full bg-[var(--vinema-border-subtle)]"
                aria-hidden="true"
                data-vinema-initial-loading-track=""
              >
                <div
                  className="vinema-initial-loading-progress h-full rounded-full bg-[rgb(20_131_91)]"
                  style={{ width: `${visualStage.progress}%` }}
                  data-vinema-initial-loading-progress=""
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
