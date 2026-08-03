export type MemorySyncEventType =
  | "LOCAL_WRITE_CREATED"
  | "OUTBOX_ENQUEUED"
  | "PUSH_STARTED"
  | "PUSH_SUCCEEDED"
  | "PUSH_FAILED"
  | "REMOTE_CHANGE_RECORDED"
  | "PULL_STARTED"
  | "PULL_SUCCEEDED"
  | "CHANGE_APPLIED"
  | "UI_INVALIDATED"
  | "CONFLICT_DETECTED"
  | "CONVERGENCE_CONFIRMED"
  | "OFFLINE_ENTERED"
  | "ONLINE_RESTORED"
  | "RECONCILIATION_STARTED"
  | "HEALTH_CHECK_COMPLETED"
  | "ORPHAN_MUTATION_CREATED"
  | "RECONCILIATION_COMPLETED";

export type MemorySyncEvent = {
  id: string;
  type: MemorySyncEventType;
  timestamp: string;
  workspaceId?: string;
  deviceId?: string;
  entityType?: "capture" | "concept" | "captureConcept" | "workspaceKnowledgeReset";
  entityId?: string;
  mutationId?: string;
  changeId?: string;
  status?: string;
  code?: string;
  count?: number;
};

export type SyncEventBuffer = {
  append(event: Omit<MemorySyncEvent, "id" | "timestamp"> & { timestamp?: string }): MemorySyncEvent;
  list(options?: { workspaceId?: string; limit?: number }): MemorySyncEvent[];
  clear(): void;
  subscribe(listener: () => void): () => void;
};

const DEFAULT_LIMIT = 100;
const listeners = new Set<() => void>();
let sequence = 0;
let events: MemorySyncEvent[] = [];

export const syncEventBuffer: SyncEventBuffer = {
  append(event) {
    sequence += 1;
    const next: MemorySyncEvent = sanitizeEvent({
      ...event,
      id: `sync-event-${sequence}`,
      timestamp: event.timestamp ?? new Date().toISOString(),
    });
    events = [next, ...events].slice(0, DEFAULT_LIMIT);
    notify();
    return next;
  },
  list(options = {}) {
    return events
      .filter((event) =>
        options.workspaceId ? event.workspaceId === options.workspaceId : true,
      )
      .slice(0, options.limit ?? DEFAULT_LIMIT)
      .map((event) => ({ ...event }));
  },
  clear() {
    events = [];
    notify();
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function appendMemorySyncEvent(
  event: Parameters<SyncEventBuffer["append"]>[0],
) {
  return syncEventBuffer.append(event);
}

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function sanitizeEvent(event: MemorySyncEvent): MemorySyncEvent {
  return removeUndefined({
    id: event.id,
    type: event.type,
    timestamp: event.timestamp,
    workspaceId: event.workspaceId,
    deviceId: event.deviceId,
    entityType: event.entityType,
    entityId: event.entityId,
    mutationId: event.mutationId,
    changeId: event.changeId,
    status: event.status,
    code: event.code,
    count: event.count,
  });
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
