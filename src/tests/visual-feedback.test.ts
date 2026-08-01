import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VisualFeedbackProvider,
  VisualFeedbackViewport,
  useVisualFeedback,
} from "@/features/feedback/visual-feedback-provider";
import {
  createVisualFeedbackService,
  type VisualFeedbackService,
} from "@/features/feedback/visual-feedback-service";
import { initialSyncState, type SyncState } from "@/features/sync/sync-state-engine";

const mocks = vi.hoisted(() => ({
  syncState: {
    lifecycle: "STARTED",
    phase: "IDLE",
    connectivity: "ONLINE",
    authentication: "AUTHENTICATED",
    pendingMutations: 0,
    processingMutations: 0,
    failedMutations: 0,
    conflictCount: 0,
    lastRunStartedAt: null,
    lastRunFinishedAt: null,
    lastSuccessfulSyncAt: null,
    nextRunAt: null,
    lastError: null,
  } as SyncState,
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ syncState: mocks.syncState }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let currentRoot: Root | null = null;

describe("VisualFeedbackService", () => {
  it("queues events by priority without losing lower-priority pulses", () => {
    const service = createVisualFeedbackService();

    service.capture();
    service.error("No fue posible sincronizar.");

    expect(service.getState().current).toMatchObject({
      kind: "error",
      message: "No fue posible sincronizar.",
    });
    expect(service.getState().queue.map((event) => event.kind)).toEqual([
      "capture",
    ]);

    service.dismissCurrent();

    expect(service.getState().current?.kind).toBe("capture");
  });

  it("keeps sync ahead of capture and lower-priority events", () => {
    const service = createVisualFeedbackService();

    service.capture();
    service.concept();
    service.syncing();

    expect(service.getState().current?.kind).toBe("syncing");
    expect(service.getState().queue.map((event) => event.kind)).toEqual([
      "capture",
      "concept",
    ]);
  });

  it("deduplicates persistent offline and syncing states", () => {
    const service = createVisualFeedbackService();

    service.offline();
    service.offline();
    service.syncing();
    service.syncing();

    expect(
      [service.getState().current, ...service.getState().queue].filter(
        (event) => event?.kind === "offline",
      ),
    ).toHaveLength(1);
    expect(
      [service.getState().current, ...service.getState().queue].filter(
        (event) => event?.kind === "syncing",
      ),
    ).toHaveLength(1);
  });
});

describe("VisualFeedbackViewport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setNavigatorOnline(true);
    mocks.syncState = { ...initialSyncState, connectivity: "ONLINE" };
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
      currentRoot?.unmount();
      await flushPromises();
    });
    currentRoot = null;
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("renders one fixed aria-live pulse and auto-dismisses success", async () => {
    const service = createVisualFeedbackService();
    const screen = await renderFeedback(service, "capture");

    const viewport = screen.querySelector("[data-visual-feedback-viewport]");
    expect(viewport?.getAttribute("aria-live")).toBe("polite");
    expect(viewport?.className).toContain("fixed");
    expect(viewport?.className).toContain("top-16");
    expect(screen.querySelector("[data-feedback-kind='capture']")).toBeTruthy();
    expect(visiblePulseText(screen)).toBe("");

    await advanceTime(700);

    expect(screen.querySelector("[data-feedback-kind='idle']")).toBeTruthy();
  });

  it("shows syncing from sync state and then a short synced pulse", async () => {
    const service = createVisualFeedbackService();
    mocks.syncState = { ...initialSyncState, phase: "PUSHING", connectivity: "ONLINE" };
    const screen = await renderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='syncing']")).toBeTruthy();
    expect(screen.querySelector(".animate-spin")).toBeTruthy();

    mocks.syncState = { ...initialSyncState, phase: "SUCCESS", connectivity: "ONLINE" };
    await rerenderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='synced']")).toBeTruthy();

    await advanceTime(2_000);

    expect(screen.querySelector("[data-feedback-kind='idle']")).toBeTruthy();
  });

  it("shows offline persistently without visible words", async () => {
    const service = createVisualFeedbackService();
    setNavigatorOnline(false);
    const screen = await renderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='offline']")).toBeTruthy();
    expect(visiblePulseText(screen)).toBe("");

    await advanceTime(5_000);

    expect(screen.querySelector("[data-feedback-kind='offline']")).toBeTruthy();
  });

  it("shows error text and keeps motion-reduce classes", async () => {
    const service = createVisualFeedbackService();
    const screen = await renderFeedback(service, "error");

    expect(screen.querySelector("[data-feedback-kind='error']")).toBeTruthy();
    expect(screen.textContent).toContain("No fue posible sincronizar.");
    expect(screen.querySelector("[role='alert']")).toBeTruthy();
    expect(screen.querySelector("[data-feedback-kind='error']")?.className).toContain(
      "motion-reduce:transition-none",
    );
  });

  it("shows multiple consecutive events one at a time", async () => {
    const service = createVisualFeedbackService();
    const screen = await renderFeedback(service, "multiple");

    expect(screen.querySelector("[data-feedback-kind='capture']")).toBeTruthy();

    await advanceTime(700);

    expect(screen.querySelector("[data-feedback-kind='idea']")).toBeTruthy();

    await advanceTime(700);

    expect(screen.querySelector("[data-feedback-kind='relation']")).toBeTruthy();
  });
});

function TestPublisher({ mode }: { mode?: string }) {
  const feedback = useVisualFeedback();

  useEffect(() => {
    if (mode === "capture") {
      feedback.capture();
    }

    if (mode === "error") {
      feedback.error("No fue posible sincronizar.");
    }

    if (mode === "multiple") {
      feedback.capture();
      feedback.idea();
      feedback.relation();
    }
  }, [feedback, mode]);

  return null;
}

async function renderFeedback(service: VisualFeedbackService, mode?: string) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  currentRoot = createRoot(container);

  await act(async () => {
    currentRoot?.render(
      createElement(
        VisualFeedbackProvider,
        { service },
        createElement(VisualFeedbackViewport),
        createElement(TestPublisher, { mode }),
      ),
    );
    await flushPromises();
  });

  return container;
}

async function rerenderFeedback(service: VisualFeedbackService) {
  await act(async () => {
    currentRoot?.render(
      createElement(
        VisualFeedbackProvider,
        { service },
        createElement(VisualFeedbackViewport),
      ),
    );
    await flushPromises();
  });
}

async function advanceTime(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await flushPromises();
  });
}

function setNavigatorOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
}

function visiblePulseText(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll("[data-feedback-kind] span:not(.sr-only)"),
  ).map((element) => element.textContent ?? "").join("");
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
