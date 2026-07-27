export type SyncErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "WORKSPACE_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "ENTITY_NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR";

export function syncError(
  code: SyncErrorCode,
  message: string,
  details?: unknown[],
) {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}
