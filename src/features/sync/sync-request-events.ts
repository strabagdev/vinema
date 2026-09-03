export type PendingSyncRequestDetail = {
  workspaceId: string;
  deviceId: string;
  requestedAt: string;
};

export type PendingSyncRequestListener = (
  detail: PendingSyncRequestDetail,
) => void;

export const PENDING_SYNC_REQUEST_EVENT = "vinema:pending-sync-request";

const pendingSyncRequestTarget = new EventTarget();

export function requestPendingSync(detail: PendingSyncRequestDetail) {
  if (!detail.workspaceId.trim() || !detail.deviceId.trim()) {
    return;
  }

  pendingSyncRequestTarget.dispatchEvent(
    new CustomEvent<PendingSyncRequestDetail>(PENDING_SYNC_REQUEST_EVENT, {
      detail,
    }),
  );
}

export function subscribeToPendingSyncRequests(
  listener: PendingSyncRequestListener,
) {
  function handleEvent(event: Event) {
    listener((event as CustomEvent<PendingSyncRequestDetail>).detail);
  }

  pendingSyncRequestTarget.addEventListener(
    PENDING_SYNC_REQUEST_EVENT,
    handleEvent,
  );

  return () => {
    pendingSyncRequestTarget.removeEventListener(
      PENDING_SYNC_REQUEST_EVENT,
      handleEvent,
    );
  };
}
