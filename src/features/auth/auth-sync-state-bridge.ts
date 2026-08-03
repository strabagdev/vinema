import type { AuthStateEngine } from "@/features/auth/auth-state-engine";
import type { SyncStateEngine } from "@/features/sync/sync-state-engine";

export function createAuthSyncStateBridge({
  authStateEngine,
  syncStateEngine,
}: {
  authStateEngine: Pick<AuthStateEngine, "getState" | "subscribe">;
  syncStateEngine: Pick<SyncStateEngine, "dispatch">;
}) {
  const publish = (status: ReturnType<typeof authStateEngine.getState>["status"]) => {
    if (status === "AUTHENTICATED_ONLINE" || status === "AUTHENTICATED_OFFLINE") {
      syncStateEngine.dispatch({
        type: "AUTHENTICATION_CHANGED",
        authentication: status,
      });
      return;
    }

    if (status === "AUTHENTICATED") {
      syncStateEngine.dispatch({
        type: "AUTHENTICATION_CHANGED",
        authentication: "AUTHENTICATED",
      });
      return;
    }

    if (status === "UNAUTHENTICATED") {
      syncStateEngine.dispatch({
        type: "AUTHENTICATION_CHANGED",
        authentication: "UNAUTHENTICATED",
      });
      return;
    }

    syncStateEngine.dispatch({
      type: "AUTHENTICATION_CHANGED",
      authentication: "UNKNOWN",
    });
  };

  publish(authStateEngine.getState().status);
  const unsubscribe = authStateEngine.subscribe((state) => publish(state.status));

  return { dispose: unsubscribe };
}
