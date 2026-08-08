import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VisualFeedbackProvider,
  VisualFeedbackViewport,
  VisualFeedbackWordmark,
  useVisualFeedback,
} from "@/features/feedback/visual-feedback-provider";
import {
  createVisualFeedbackService,
  MIN_CAPTURE_CONFIRMATION_MS,
  MIN_CAPTURE_VISIBLE_MS,
  SYNCED_VISIBLE_MS,
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

  it("queues sync behind a fresh capture but ahead of lower-priority events", () => {
    const service = createVisualFeedbackService();

    service.capture();
    service.concept();
    service.syncing();

    expect(service.getState().current?.kind).toBe("capture");
    expect(service.getState().queue.map((event) => event.kind)).toEqual([
      "syncing",
      "concept",
    ]);
  });

  it("replaces transient saving with the local capture confirmation", () => {
    const service = createVisualFeedbackService();

    service.saving();
    service.capture();

    expect(service.getState().current?.kind).toBe("capture");
    expect(service.getState().queue.map((event) => event.kind)).not.toContain(
      "saving",
    );
  });

  it("deduplicates persistent offline and syncing states", () => {
    const service = createVisualFeedbackService();

    service.offline();
    service.offline();
    expect(
      [service.getState().current, ...service.getState().queue].filter(
        (event) => event?.kind === "offline",
      ),
    ).toHaveLength(1);

    service.syncing();
    service.syncing();

    expect(
      [service.getState().current, ...service.getState().queue].filter(
        (event) => event?.kind === "offline",
      ),
    ).toHaveLength(0);
    expect(
      [service.getState().current, ...service.getState().queue].filter(
        (event) => event?.kind === "syncing",
      ),
    ).toHaveLength(1);
  });

  it("removes stale offline entries when synchronization resumes", () => {
    const service = createVisualFeedbackService();

    service.offline();
    expect(service.getState().current?.kind).toBe("offline");

    service.syncing();
    expect(service.getState().current?.kind).toBe("syncing");
    expect(
      [service.getState().current, ...service.getState().queue].some(
        (event) => event?.kind === "offline",
      ),
    ).toBe(false);

    service.offline();
    expect(service.getState().current?.kind).toBe("offline");
    expect(
      [service.getState().current, ...service.getState().queue].some(
        (event) => event?.dedupeKey === "sync",
      ),
    ).toBe(false);
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

  it("renders an aria-live region and keeps idle visually silent", async () => {
    const service = createVisualFeedbackService();
    const screen = await renderFeedback(service);

    const viewport = screen.querySelector("[data-visual-feedback-viewport]");
    expect(viewport?.getAttribute("aria-live")).toBe("polite");
    expect(viewport?.className).toContain("sr-only");
    expect(
      screen.querySelector("[data-feedback-wordmark] [data-vinema-brand='monogram']"),
    ).toBeTruthy();
    expect(screen.querySelector("[data-feedback-wordmark]")?.textContent).not.toContain("VN");
    expect(screen.querySelector("[data-feedback-wordmark] svg")).toBeNull();
    expect(screen.querySelector("[data-feedback-kind='idle']")).toBeTruthy();
  });

  it("announces saving while keeping the wordmark as identity", async () => {
    const service = createVisualFeedbackService();
    const screen = await renderFeedback(service, "saving");

    expect(
      screen.querySelector("[data-feedback-wordmark][data-feedback-kind='identity']"),
    ).toBeTruthy();
    expect(
      screen.querySelector("[data-feedback-wordmark] .animate-pulse"),
    ).toBeNull();
    expect(
      screen.querySelector("[data-visual-feedback-viewport]")?.textContent,
    ).toBe("Guardando.");
  });

  it("announces local capture without turning the wordmark into status", async () => {
    const service = createVisualFeedbackService();
    const screen = await renderFeedback(service, "capture");

    expect(
      screen.querySelector("[data-feedback-wordmark][data-feedback-kind='identity']"),
    ).toBeTruthy();
    expect(
      screen.querySelector("[data-feedback-wordmark] .text-emerald-600"),
    ).toBeNull();
    expect(
      screen.querySelector("[data-visual-feedback-viewport]")?.textContent,
    ).toBe("Captura creada.");

    await advanceTime(MIN_CAPTURE_CONFIRMATION_MS);

    expect(screen.querySelector("[data-feedback-kind='idle']")).toBeTruthy();
  });

  it("keeps capture feedback visible before immediate synchronization", async () => {
    const service = createVisualFeedbackService();
    const screen = await renderFeedback(service, "captureThenSync");

    expect(screen.querySelector("[data-feedback-kind='capture']")).toBeTruthy();
    expect(service.getState().queue.map((event) => event.kind)).toEqual([
      "syncing",
    ]);

    await advanceTime(MIN_CAPTURE_VISIBLE_MS - 1);

    expect(screen.querySelector("[data-feedback-kind='capture']")).toBeTruthy();

    await advanceTime(1);

    expect(screen.querySelector("[data-feedback-kind='syncing']")).toBeTruthy();
  });

  it("goes from capture to idle when no synchronization follows", async () => {
    const service = createVisualFeedbackService();
    const screen = await renderFeedback(service, "capture");

    expect(screen.querySelector("[data-feedback-kind='capture']")).toBeTruthy();

    await advanceTime(MIN_CAPTURE_CONFIRMATION_MS);

    expect(screen.querySelector("[data-feedback-kind='idle']")).toBeTruthy();
  });

  it("shows two captures in sequence without dropping either pulse", async () => {
    const service = createVisualFeedbackService();
    const screen = await renderFeedback(service, "twoCaptures");

    const firstId = service.getState().current?.id;
    expect(screen.querySelector("[data-feedback-kind='capture']")).toBeTruthy();
    expect(service.getState().queue.map((event) => event.kind)).toEqual([
      "capture",
    ]);

    await advanceTime(MIN_CAPTURE_CONFIRMATION_MS);

    expect(screen.querySelector("[data-feedback-kind='capture']")).toBeTruthy();
    expect(service.getState().current?.id).not.toBe(firstId);

    await advanceTime(MIN_CAPTURE_CONFIRMATION_MS);

    expect(screen.querySelector("[data-feedback-kind='idle']")).toBeTruthy();
  });

  it("lets a save error replace capture feedback immediately", async () => {
    const service = createVisualFeedbackService();
    const screen = await renderFeedback(service, "captureThenError");

    expect(screen.querySelector("[data-feedback-kind='error']")).toBeTruthy();
    expect(screen.textContent).toContain("No se pudo guardar la captura.");
  });

  it("shows syncing for local work and then a short synced pulse", async () => {
    const service = createVisualFeedbackService();
    mocks.syncState = syncState({
      phase: "PUSHING",
      pendingMutations: 1,
    });
    const screen = await renderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='syncing']")).toBeTruthy();
    expect(screen.querySelector("[data-visual-feedback-viewport]")?.textContent).toBe(
      "Actualizando memoria...",
    );
    expect(screen.querySelector("[data-feedback-wordmark] .animate-spin")).toBeNull();
    expect(
      screen.querySelector("[data-feedback-wordmark][data-feedback-kind='identity']"),
    ).toBeTruthy();

    mocks.syncState = syncState({
      phase: "WAITING",
      lastSuccessfulSyncAt: "2026-01-01T00:00:02.000Z",
    });
    await rerenderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='synced']")).toBeTruthy();

    await advanceTime(SYNCED_VISIBLE_MS);

    expect(screen.querySelector("[data-feedback-kind='idle']")).toBeTruthy();
  });

  it("keeps an empty periodic sync cycle visually idle", async () => {
    const service = createVisualFeedbackService();
    mocks.syncState = syncState({ phase: "PUSHING" });
    const screen = await renderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='idle']")).toBeTruthy();

    mocks.syncState = syncState({
      phase: "WAITING",
      lastSuccessfulSyncAt: "2026-01-01T00:00:02.000Z",
    });
    await rerenderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='idle']")).toBeTruthy();
  });

  it("replaces syncing with error when a sync cycle fails", async () => {
    const service = createVisualFeedbackService();
    mocks.syncState = syncState({
      phase: "PULLING",
      processingMutations: 1,
    });
    const screen = await renderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='syncing']")).toBeTruthy();

    mocks.syncState = syncState({
      phase: "ERROR",
      lastError: {
        source: "PULL",
        message: "No fue posible sincronizar.",
        occurredAt: "2026-01-01T00:00:02.000Z",
      },
    });
    await rerenderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='error']")).toBeTruthy();
    expect(screen.querySelector("[data-feedback-kind='syncing']")).toBeNull();
    expect(screen.textContent).toContain("No fue posible sincronizar.");
  });

  it("clears a historical red alert when a new sync cycle succeeds", async () => {
    const service = createVisualFeedbackService();
    mocks.syncState = syncState({
      phase: "ERROR",
      lastError: {
        source: "PULL",
        message: "Ocurrio un error",
        occurredAt: "2026-01-01T00:00:01.000Z",
      },
    });
    const screen = await renderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='error']")).toBeTruthy();

    mocks.syncState = syncState({
      phase: "PUSHING",
      pendingMutations: 1,
      lastError: null,
    });
    await rerenderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='syncing']")).toBeTruthy();
    expect(screen.textContent).not.toContain("Ocurrio un error");

    mocks.syncState = syncState({
      phase: "SUCCESS",
      lastSuccessfulSyncAt: "2026-01-01T00:00:02.000Z",
      lastError: null,
    });
    await rerenderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='synced']")).toBeTruthy();
    expect(screen.textContent).not.toContain("Ocurrio un error");
  });

  it("replaces syncing with offline when connectivity drops", async () => {
    const service = createVisualFeedbackService();
    mocks.syncState = syncState({
      phase: "PUSHING",
      pendingMutations: 1,
    });
    const screen = await renderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='syncing']")).toBeTruthy();

    mocks.syncState = syncState({
      phase: "PUSHING",
      connectivity: "OFFLINE",
      pendingMutations: 1,
    });
    await rerenderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='offline']")).toBeTruthy();
    expect(screen.querySelector("[data-feedback-kind='syncing']")).toBeNull();
  });

  it("does not restart the spinner for duplicate active sync events", async () => {
    const service = createVisualFeedbackService();
    mocks.syncState = syncState({
      phase: "PUSHING",
      pendingMutations: 1,
    });
    const screen = await renderFeedback(service);

    const firstId = service.getState().current?.id;

    mocks.syncState = syncState({
      phase: "PUSHING",
      pendingMutations: 1,
    });
    await rerenderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='syncing']")).toBeTruthy();
    expect(service.getState().current?.id).toBe(firstId);
  });

  it("clears syncing after a defensive timeout if no terminal state arrives", async () => {
    const service = createVisualFeedbackService();
    mocks.syncState = syncState({
      phase: "PUSHING",
      pendingMutations: 1,
    });
    const screen = await renderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='syncing']")).toBeTruthy();

    await advanceTime(15_000);

    expect(screen.querySelector("[data-feedback-kind='idle']")).toBeTruthy();
  });

  it("clears syncing on cancellation", async () => {
    const service = createVisualFeedbackService();
    mocks.syncState = syncState({
      phase: "PUSHING",
      pendingMutations: 1,
    });
    const screen = await renderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='syncing']")).toBeTruthy();

    mocks.syncState = syncState({
      phase: "CANCELLED",
      lastError: {
        source: "ORCHESTRATOR",
        code: "CANCELLED",
        message: "La sincronizacion fue cancelada.",
        occurredAt: "2026-01-01T00:00:02.000Z",
      },
    });
    await rerenderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='syncing']")).toBeNull();
  });

  it("shows offline persistently without adding visible status copy", async () => {
    const service = createVisualFeedbackService();
    setNavigatorOnline(false);
    const screen = await renderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='offline']")).toBeTruthy();
    expect(
      screen.querySelector("[data-feedback-wordmark] [data-vinema-brand='monogram']"),
    ).toBeTruthy();
    expect(screen.querySelector("[data-feedback-wordmark]")?.textContent).not.toContain("VN");
    expect(screen.querySelector("[data-visual-feedback-viewport]")?.textContent).toBe(
      "Modo local. Los cambios se sincronizaran luego.",
    );

    await advanceTime(5_000);

    expect(screen.querySelector("[data-feedback-kind='offline']")).toBeTruthy();
  });

  it("clears persistent offline feedback when connectivity returns without work", async () => {
    const service = createVisualFeedbackService();
    setNavigatorOnline(false);
    mocks.syncState = syncState({ connectivity: "OFFLINE" });
    const screen = await renderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='offline']")).toBeTruthy();

    setNavigatorOnline(true);
    mocks.syncState = syncState({ connectivity: "ONLINE", phase: "WAITING" });
    await rerenderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='idle']")).toBeTruthy();
  });

  it("transitions offline with pending work to syncing, synced and idle after reconnect", async () => {
    const service = createVisualFeedbackService();
    setNavigatorOnline(false);
    mocks.syncState = syncState({
      connectivity: "OFFLINE",
      pendingMutations: 1,
    });
    const screen = await renderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='offline']")).toBeTruthy();

    setNavigatorOnline(true);
    mocks.syncState = syncState({
      connectivity: "ONLINE",
      phase: "PUSHING",
      pendingMutations: 1,
    });
    await rerenderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='syncing']")).toBeTruthy();
    expect(screen.querySelector("[data-feedback-kind='offline']")).toBeNull();

    mocks.syncState = syncState({
      connectivity: "ONLINE",
      phase: "SUCCESS",
      lastSuccessfulSyncAt: "2026-01-01T00:00:02.000Z",
    });
    await rerenderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='synced']")).toBeTruthy();

    await advanceTime(SYNCED_VISIBLE_MS);

    expect(screen.querySelector("[data-feedback-kind='idle']")).toBeTruthy();
  });

  it("clears offline feedback when auth returns online even before a sync cycle", async () => {
    const service = createVisualFeedbackService();
    setNavigatorOnline(false);
    mocks.syncState = syncState({
      connectivity: "OFFLINE",
      authentication: "AUTHENTICATED_OFFLINE",
    });
    const screen = await renderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='offline']")).toBeTruthy();

    setNavigatorOnline(true);
    mocks.syncState = syncState({
      connectivity: "ONLINE",
      authentication: "AUTHENTICATED_ONLINE",
    });
    await rerenderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='idle']")).toBeTruthy();
  });

  it("does not duplicate feedback for duplicate reconnect events", async () => {
    const service = createVisualFeedbackService();
    setNavigatorOnline(false);
    mocks.syncState = syncState({ connectivity: "OFFLINE" });
    const screen = await renderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='offline']")).toBeTruthy();

    setNavigatorOnline(true);
    mocks.syncState = syncState({ connectivity: "ONLINE", phase: "WAITING" });
    await rerenderFeedback(service);
    await rerenderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='idle']")).toBeTruthy();
    expect(service.getState().queue).toEqual([]);
  });

  it("lets a real sync error interrupt reconnect feedback", async () => {
    const service = createVisualFeedbackService();
    setNavigatorOnline(false);
    mocks.syncState = syncState({
      connectivity: "OFFLINE",
      pendingMutations: 1,
    });
    const screen = await renderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='offline']")).toBeTruthy();

    setNavigatorOnline(true);
    mocks.syncState = syncState({
      connectivity: "ONLINE",
      phase: "ERROR",
      lastError: {
        source: "PUSH",
        code: "SERVER_ERROR",
        message: "No fue posible sincronizar.",
        occurredAt: "2026-01-01T00:00:02.000Z",
      },
    });
    await rerenderFeedback(service);

    expect(screen.querySelector("[data-feedback-kind='error']")).toBeTruthy();
    expect(screen.querySelector("[data-feedback-kind='offline']")).toBeNull();
    expect(screen.querySelector("[data-feedback-kind='synced']")).toBeNull();
  });

  it("shows error text without assigning error state to the wordmark", async () => {
    const service = createVisualFeedbackService();
    const screen = await renderFeedback(service, "error");

    expect(screen.querySelector("[data-feedback-kind='error']")).toBeTruthy();
    expect(screen.textContent).toContain("No fue posible sincronizar.");
    expect(screen.querySelector("[role='alert']")).toBeTruthy();
    expect(
      screen.querySelector("[data-feedback-wordmark][data-feedback-kind='identity']")
        ?.className,
    ).toContain("motion-reduce:transition-none");
  });

  it("shows multiple consecutive events one at a time", async () => {
    const service = createVisualFeedbackService();
    const screen = await renderFeedback(service, "multiple");

    expect(screen.querySelector("[data-feedback-kind='capture']")).toBeTruthy();

    await advanceTime(MIN_CAPTURE_CONFIRMATION_MS);

    expect(screen.querySelector("[data-feedback-kind='idea']")).toBeTruthy();

    await advanceTime(700);

    expect(screen.querySelector("[data-feedback-kind='relation']")).toBeTruthy();
  });
});

function TestPublisher({ mode }: { mode?: string }) {
  const feedback = useVisualFeedback();

  useEffect(() => {
    if (mode === "saving") {
      feedback.saving();
    }

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

    if (mode === "captureThenSync") {
      feedback.capture();
      feedback.syncing();
    }

    if (mode === "twoCaptures") {
      feedback.capture();
      feedback.capture();
    }

    if (mode === "captureThenError") {
      feedback.capture();
      feedback.error("No se pudo guardar la captura.");
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
        createElement(VisualFeedbackWordmark),
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
        createElement(VisualFeedbackWordmark),
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

function syncState(overrides: Partial<SyncState>): SyncState {
  return {
    ...initialSyncState,
    connectivity: "ONLINE",
    ...overrides,
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
