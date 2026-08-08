import "fake-indexeddb/auto";
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { deleteDB } from "idb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGuard } from "@/features/auth/auth-guard";
import { AuthProvider, useAuth } from "@/features/auth/auth-provider";
import {
  InMemoryAuthSessionStorage,
  InMemoryLocalAuthIdentityStorage,
} from "@/features/auth/storage/in-memory-auth-session-storage";
import {
  resetVinemaDbConnectionForTests,
  VINEMA_DB_NAME,
} from "@/infrastructure/storage/vinema-db";

const router = vi.hoisted(() => ({
  pathname: "/",
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => router.pathname,
  useRouter: () => ({ replace: router.replace, push: router.push }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "user@example.test",
  displayName: "User",
};
const workspaceId = "22222222-2222-4222-8222-222222222222";
const deviceId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";
const accessTokenExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
const session = {
  user,
  workspaceId,
  deviceId,
  device: {
    id: deviceId,
    userId: user.id,
    clientDeviceId: "local-device",
    name: "Vinema Web",
    platform: "web",
    appType: "WEB",
    appVersion: "test",
    createdAt: "2026-07-30T12:00:00.000Z",
    updatedAt: "2026-07-30T12:00:00.000Z",
    lastSeenAt: "2026-07-30T12:00:00.000Z",
    revokedAt: null,
  },
  sessionId,
  accessToken: "access-token",
  accessTokenExpiresAt,
  refreshToken: "refresh-token",
  refreshTokenExpiresAt,
};

describe("auth focus lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalFetch = globalThis.fetch;
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    router.pathname = "/";
    router.push.mockReset();
    router.replace.mockReset();
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.test/";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    globalThis.fetch = originalFetch;
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  it("keeps children mounted while focus revalidates a valid session", async () => {
    const storage = await storedSession();
    let finishRevalidation: ((response: Response) => void) | null = null;
    globalThis.fetch = createLifecycleFetch([
      () => jsonResponse({
        ...session,
        accessToken: "restored-access-token",
        refreshToken: "restored-refresh-token",
      }),
      () =>
        new Promise<Response>((resolve) => {
          finishRevalidation = resolve;
          // Keep resume revalidation pending.
        }),
    ]);

    await renderProtectedProbe(storage);
    await flush();

    expect(text("[data-testid='status']")).toBe("AUTHENTICATED_ONLINE");
    expect(container.textContent).toContain("Canvas montado");

    await resumeFromFocus();

    expect(text("[data-testid='status']")).toBe("REVALIDATING");
    expect(text("[data-testid='loading']")).toBe("ready");
    expect(container.textContent).toContain("Canvas montado");
    expect(container.textContent).not.toContain("Preparando Vinema");
    expect(router.replace).not.toHaveBeenCalledWith("/login");

    await act(async () => {
      finishRevalidation?.(jsonResponse({
        ...session,
        accessToken: "revalidated-access-token",
        refreshToken: "revalidated-refresh-token",
      }));
    });
    await flush();
  });

  it("keeps children mounted while a valid session refreshes", async () => {
    const storage = await storedSession();
    let finishRefresh: ((response: Response) => void) | null = null;
    globalThis.fetch = createLifecycleFetch([
      () => jsonResponse({
        ...session,
        accessToken: "restored-access-token",
        refreshToken: "restored-refresh-token",
      }),
      () =>
        new Promise<Response>((resolve) => {
          finishRefresh = resolve;
          // Keep explicit refresh pending.
        }),
    ]);

    await renderProtectedProbe(storage, { refreshButton: true });
    await flush();

    await click("button");
    await flush();

    expect(text("[data-testid='status']")).toBe("REFRESHING");
    expect(text("[data-testid='loading']")).toBe("ready");
    expect(container.textContent).toContain("Canvas montado");
    expect(container.textContent).not.toContain("Preparando Vinema");

    await act(async () => {
      finishRefresh?.(jsonResponse({
        ...session,
        accessToken: "refreshed-access-token",
        refreshToken: "refreshed-refresh-token",
      }));
    });
    await flush();
  });

  it("keeps children mounted after a temporary resume network error", async () => {
    const storage = await storedSession();
    globalThis.fetch = createLifecycleFetch([
      () => jsonResponse({
        ...session,
        accessToken: "restored-access-token",
        refreshToken: "restored-refresh-token",
      }),
      () => Promise.reject(new TypeError("offline")),
    ]);

    await renderProtectedProbe(storage);
    await flush();
    await resumeFromFocus();

    expect(text("[data-testid='status']")).toBe("AUTHENTICATED_OFFLINE");
    expect(text("[data-testid='authenticated']")).toBe("yes");
    expect(container.textContent).toContain("Canvas montado");
    expect(container.textContent).not.toContain("Preparando Vinema");
    expect(router.replace).not.toHaveBeenCalledWith("/login");
  });

  it("redirects when resume confirms the session is invalid", async () => {
    const storage = await storedSession();
    globalThis.fetch = createLifecycleFetch([
      () => jsonResponse({
        ...session,
        accessToken: "restored-access-token",
        refreshToken: "restored-refresh-token",
      }),
      () => jsonResponse({
        error: { code: "TOKEN_INVALID", message: "Invalid" },
      }, 401),
    ]);

    await renderProtectedProbe(storage);
    await flush();
    await resumeFromFocus();

    expect(router.replace).toHaveBeenCalledWith("/login");
    expect(container.textContent).not.toContain("Canvas montado");
    expect(storage.snapshot()).toBeNull();
  });

  async function renderProtectedProbe(
    storage: InMemoryAuthSessionStorage,
    options: { refreshButton?: boolean } = {},
  ) {
    const TestAuthProvider = AuthProvider as unknown as ComponentType<{
      authSessionStorage: InMemoryAuthSessionStorage;
      localAuthIdentityStorage: InMemoryLocalAuthIdentityStorage;
    }>;

    await act(async () => {
      root.render(
        createElement(
          TestAuthProvider,
          {
            authSessionStorage: storage,
            localAuthIdentityStorage: new InMemoryLocalAuthIdentityStorage(),
          },
          createElement(
            AuthGuard,
            null,
            createElement(Probe, { refreshButton: options.refreshButton }),
          ),
        ),
      );
    });
  }

  async function resumeFromFocus() {
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await wait(260);
    });
    await flush();
  }

  async function click(selector: string) {
    await act(async () => {
      query<HTMLButtonElement>(selector).click();
    });
  }

  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  function query<T extends Element>(selector: string): T {
    const element = container.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Missing element ${selector}`);
    }

    return element;
  }

  function text(selector: string) {
    return query<HTMLElement>(selector).textContent;
  }
});

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function Probe({ refreshButton = false }: { refreshButton?: boolean }) {
  const auth = useAuth();
  return createElement(
    "div",
    null,
    createElement("p", { "data-testid": "status" }, auth.state.status),
    createElement("p", { "data-testid": "loading" }, auth.isLoading ? "loading" : "ready"),
    createElement(
      "p",
      { "data-testid": "authenticated" },
      auth.isAuthenticated ? "yes" : "no",
    ),
    createElement("p", null, "Canvas montado"),
    refreshButton
      ? createElement(
          "button",
          {
            type: "button",
            onClick: () => {
              void auth.refresh().catch(() => undefined);
            },
          },
          "Refresh",
        )
      : null,
  );
}

async function storedSession() {
  const storage = new InMemoryAuthSessionStorage();
  await storage.save({
    refreshToken: "stored-refresh-token",
    sessionId,
    deviceId,
    storedAt: "2026-07-30T12:00:00.000Z",
    user,
    workspaceId,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
  });
  return storage;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createLifecycleFetch(
  refreshResponses: Array<() => Response | Promise<Response>>,
) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);

    if (url.includes("/auth/refresh")) {
      const next = refreshResponses.shift();
      return next ? next() : jsonResponse({}, 500);
    }

    if (url.includes("/api/sync/push")) {
      return jsonResponse({
        accepted: [],
        conflicts: [],
        rejected: [],
        serverCursor: "0",
      });
    }

    if (url.includes("/api/sync/pull")) {
      return jsonResponse({
        changes: [],
        nextCursor: "0",
        hasMore: false,
      });
    }

    return jsonResponse({}, 404);
  }) as unknown as typeof fetch;
}
