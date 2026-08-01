export type VisualFeedbackKind =
  | "capture"
  | "concept"
  | "error"
  | "idea"
  | "offline"
  | "relation"
  | "saving"
  | "synced"
  | "syncing";

export type VisualFeedbackEvent = {
  id: string;
  kind: VisualFeedbackKind;
  accessibleText: string;
  message?: string;
  priority: number;
  persistent: boolean;
  durationMs: number;
  sequence: number;
  dedupeKey?: string;
};

export type VisualFeedbackState = {
  current: VisualFeedbackEvent | null;
  queue: VisualFeedbackEvent[];
};

export type VisualFeedbackListener = (state: VisualFeedbackState) => void;

export type VisualFeedbackService = {
  getState(): VisualFeedbackState;
  subscribe(listener: VisualFeedbackListener): () => void;
  capture(): VisualFeedbackEvent;
  concept(): VisualFeedbackEvent;
  error(message: string): VisualFeedbackEvent;
  idea(): VisualFeedbackEvent;
  offline(): VisualFeedbackEvent;
  relation(): VisualFeedbackEvent;
  saving(): VisualFeedbackEvent;
  synced(): VisualFeedbackEvent;
  syncing(): VisualFeedbackEvent;
  dismissCurrent(): void;
  dismissKind(kind: VisualFeedbackKind): void;
  reset(): void;
};

const AUTO_DISMISS_MS = 2_000;
const BRIEF_PULSE_MS = 700;
const PRIORITY = {
  error: 1,
  syncing: 2,
  offline: 2,
  capture: 3,
  synced: 3,
  concept: 4,
  idea: 4,
  relation: 4,
  saving: 4,
} satisfies Record<VisualFeedbackKind, number>;

let defaultVisualFeedbackService: VisualFeedbackService | null = null;

export function getDefaultVisualFeedbackService() {
  defaultVisualFeedbackService ??= createVisualFeedbackService();

  return defaultVisualFeedbackService;
}

export function createVisualFeedbackService(): VisualFeedbackService {
  const listeners = new Set<VisualFeedbackListener>();
  let state: VisualFeedbackState = { current: null, queue: [] };
  let sequence = 0;

  function publish(
    kind: VisualFeedbackKind,
    options: {
      accessibleText: string;
      message?: string;
      persistent?: boolean;
      durationMs?: number;
      dedupeKey?: string;
    },
  ) {
    sequence += 1;
    const event: VisualFeedbackEvent = {
      id: `${kind}-${sequence}`,
      kind,
      accessibleText: options.accessibleText,
      message: options.message,
      priority: PRIORITY[kind],
      persistent: options.persistent ?? false,
      durationMs: options.durationMs ?? AUTO_DISMISS_MS,
      sequence,
      dedupeKey: options.dedupeKey,
    };

    if (event.dedupeKey) {
      state = removeDedupeKey(state, event.dedupeKey);
    }

    if (!state.current) {
      state = { ...state, current: event };
      notify();
      return event;
    }

    if (event.priority < state.current.priority) {
      state = {
        current: event,
        queue: sortQueue([state.current, ...state.queue]),
      };
      notify();
      return event;
    }

    state = { ...state, queue: sortQueue([...state.queue, event]) };
    notify();
    return event;
  }

  function notify() {
    const snapshot = cloneState(state);
    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  return {
    getState: () => cloneState(state),
    subscribe(listener) {
      listeners.add(listener);
      listener(cloneState(state));

      return () => {
        listeners.delete(listener);
      };
    },
    capture: () =>
      publish("capture", {
        accessibleText: "Captura creada.",
        durationMs: BRIEF_PULSE_MS,
      }),
    concept: () =>
      publish("concept", {
        accessibleText: "Concepto agregado.",
        durationMs: BRIEF_PULSE_MS,
      }),
    error: (message) =>
      publish("error", {
        accessibleText: message,
        message,
        persistent: true,
        dedupeKey: "error",
      }),
    idea: () =>
      publish("idea", {
        accessibleText: "Idea relacionada encontrada.",
        durationMs: BRIEF_PULSE_MS,
      }),
    offline: () =>
      publish("offline", {
        accessibleText: "Modo local. Los cambios se sincronizaran luego.",
        persistent: true,
        dedupeKey: "offline",
      }),
    relation: () =>
      publish("relation", {
        accessibleText: "Relacion creada.",
        durationMs: BRIEF_PULSE_MS,
      }),
    saving: () =>
      publish("saving", {
        accessibleText: "Guardando.",
        durationMs: BRIEF_PULSE_MS,
        dedupeKey: "saving",
      }),
    synced: () =>
      publish("synced", {
        accessibleText: "Sincronizado.",
        dedupeKey: "sync",
      }),
    syncing: () =>
      publish("syncing", {
        accessibleText: "Sincronizando.",
        persistent: true,
        dedupeKey: "sync",
      }),
    dismissCurrent() {
      if (!state.current) {
        return;
      }

      const [next, ...rest] = sortQueue(state.queue);
      state = { current: next ?? null, queue: rest };
      notify();
    },
    dismissKind(kind) {
      const current = state.current?.kind === kind ? null : state.current;
      const queue = state.queue.filter((event) => event.kind !== kind);
      state = current
        ? { current, queue }
        : { current: sortQueue(queue)[0] ?? null, queue: sortQueue(queue).slice(1) };
      notify();
    },
    reset() {
      state = { current: null, queue: [] };
      notify();
    },
  };
}

function removeDedupeKey(
  state: VisualFeedbackState,
  dedupeKey: string,
): VisualFeedbackState {
  return {
    current: state.current?.dedupeKey === dedupeKey ? null : state.current,
    queue: state.queue.filter((event) => event.dedupeKey !== dedupeKey),
  };
}

function sortQueue(queue: VisualFeedbackEvent[]) {
  return [...queue].sort(
    (first, second) =>
      first.priority - second.priority || first.sequence - second.sequence,
  );
}

function cloneState(state: VisualFeedbackState): VisualFeedbackState {
  return {
    current: state.current ? { ...state.current } : null,
    queue: state.queue.map((event) => ({ ...event })),
  };
}
