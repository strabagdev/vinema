export type SyncSchedulerHandle = unknown;

export type SyncScheduler = {
  schedule(callback: () => void, delayMs: number): SyncSchedulerHandle;
  cancel(handle: SyncSchedulerHandle): void;
};

export const timeoutSyncScheduler: SyncScheduler = {
  schedule(callback, delayMs) {
    return setTimeout(callback, delayMs);
  },
  cancel(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};
