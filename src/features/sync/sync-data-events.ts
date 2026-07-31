export type SyncDataEntityType = "capture" | "concept" | "captureConcept";

export type SyncDataChangedEventDetail = {
  workspaceId: string;
  entityTypes: SyncDataEntityType[];
  changedAt: string;
};

export type SyncDataChangedListener = (
  detail: SyncDataChangedEventDetail,
) => void;

export const SYNC_DATA_CHANGED_EVENT = "vinema:sync-data-changed";

const syncDataEventTarget = new EventTarget();

export function emitSyncDataChanged(detail: SyncDataChangedEventDetail) {
  if (!detail.workspaceId.trim() || detail.entityTypes.length === 0) {
    return;
  }

  const uniqueEntityTypes = Array.from(new Set(detail.entityTypes));
  syncDataEventTarget.dispatchEvent(
    new CustomEvent<SyncDataChangedEventDetail>(SYNC_DATA_CHANGED_EVENT, {
      detail: {
        workspaceId: detail.workspaceId,
        entityTypes: uniqueEntityTypes,
        changedAt: detail.changedAt,
      },
    }),
  );
}

export function subscribeToSyncDataChanged(
  listener: SyncDataChangedListener,
) {
  function handleEvent(event: Event) {
    listener((event as CustomEvent<SyncDataChangedEventDetail>).detail);
  }

  syncDataEventTarget.addEventListener(SYNC_DATA_CHANGED_EVENT, handleEvent);

  return () => {
    syncDataEventTarget.removeEventListener(SYNC_DATA_CHANGED_EVENT, handleEvent);
  };
}
