export type RemoteSyncMetadata = {
  serverVersion: number | null;
  syncStatus: "LOCAL_ONLY" | "PENDING" | "SYNCED" | "CONFLICT" | "ERROR";
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};
