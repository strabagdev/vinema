import "fake-indexeddb/auto";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { deleteDB } from "idb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginClient } from "@/app/login/login-client";
import { RegisterClient } from "@/app/register/register-client";
import { AuthGuard } from "@/features/auth/auth-guard";
import { AuthProvider, useAuth } from "@/features/auth/auth-provider";
import { AuthClientError } from "@/features/auth/auth-client";
import {
  getAuthFormError,
  validateEmail,
  validatePassword,
} from "@/features/auth/auth-form-utils";
import {
  getPublicApiUrl,
  normalizePublicApiUrl,
} from "@/features/auth/public-api-url";
import {
  InMemoryAuthSessionStorage,
  InMemoryLocalAuthIdentityStorage,
} from "@/features/auth/storage/in-memory-auth-session-storage";
import type { StoredLocalAuthIdentity } from "@/features/auth/storage/auth-session-storage";
import { IndexedDbContextRepository } from "@/infrastructure/context/indexed-db-context-repository";
import { IndexedDbNodeContextRelationRepository } from "@/infrastructure/context/indexed-db-node-context-relation-repository";
import { IndexedDbNodeRepository } from "@/infrastructure/node/indexed-db-node-repository";
import { VINEMA_DB_NAME, resetVinemaDbConnectionForTests } from "@/infrastructure/storage/vinema-db";

const routerReplace = vi.fn();
let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
}));

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "user@example.test",
  displayName: "User",
};
const workspaceId = "22222222-2222-4222-8222-222222222222";
const deviceId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";
const accessTokenExpiresAt = "2099-07-30T12:15:00.000Z";
const refreshTokenExpiresAt = "2099-08-29T12:00:00.000Z";
const device = {
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
};
const session = {
  user,
  workspaceId,
  deviceId,
  device,
  sessionId,
  accessToken: "access-token",
  accessTokenExpiresAt,
  refreshToken: "refresh-token",
  refreshTokenExpiresAt,
};

describe("minimal authentication UI", () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalFetch = globalThis.fetch;
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    pathname = "/";
    routerReplace.mockReset();
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
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    vi.useRealTimers();
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  it("AuthProvider starts anonymous, logs in, exposes token and logs out locally", async () => {
    globalThis.fetch = createFetch([jsonResponse(session), jsonResponse({ ok: true })]);

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <p data-testid="status">{auth.state.status}</p>
          <p data-testid="token">{auth.accessToken ?? "none"}</p>
          <button
            type="button"
            onClick={() => {
              void auth.login({
                email: user.email,
                password: "password-123",
              });
            }}
          >
            Login
          </button>
          <button type="button" onClick={auth.logout}>
            Logout
          </button>
        </div>
      );
    }

    await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await flush();
    expect(text("[data-testid='status']")).toBe("UNAUTHENTICATED");

    await click("button");
    expect(text("[data-testid='status']")).toBe("AUTHENTICATED_ONLINE");
    expect(text("[data-testid='token']")).toBe("access-token");

    await click("button:nth-of-type(2)");
    expect(text("[data-testid='status']")).toBe("UNAUTHENTICATED");
    expect(text("[data-testid='token']")).toBe("none");
  });

  it("AuthProvider registers successfully and reports login failures", async () => {
    globalThis.fetch = createFetch([
      jsonResponse(session, 201),
      jsonResponse({ error: { code: "INVALID_CREDENTIALS", message: "No" } }, 401),
    ]);

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <p data-testid="status">{auth.state.status}</p>
          <p data-testid="error">{auth.error?.code ?? "none"}</p>
          <button
            type="button"
            onClick={() => {
              void auth.register({
                displayName: "User",
                email: user.email,
                password: "password-123",
              });
            }}
          >
            Register
          </button>
          <button
            type="button"
            onClick={() => {
              void auth.login({ email: user.email, password: "bad-password" }).catch(() => undefined);
            }}
          >
            Bad login
          </button>
        </div>
      );
    }

    await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await flush();
    await click("button");
    expect(text("[data-testid='status']")).toBe("AUTHENTICATED_ONLINE");
    await click("button:nth-of-type(2)");
    expect(text("[data-testid='status']")).toBe("UNAUTHENTICATED");
    expect(text("[data-testid='error']")).toBe("INVALID_CREDENTIALS");
  });

  it("Login renders, validates, submits, shows loading/errors and links to register", async () => {
    let resolveLogin: ((response: Response) => void) | undefined;
    globalThis.fetch = vi.fn(
      () => new Promise<Response>((resolve) => {
        resolveLogin = resolve;
      }),
    ) as unknown as typeof fetch;
    pathname = "/login";

    await render(
      <AuthProvider>
        <LoginClient />
      </AuthProvider>,
    );
    await flush();

    expect(container.textContent).toContain("Inicia sesion");
    expect(container.querySelector("[data-vinema-brand='wordmark']")).toBeTruthy();
    expect(container.querySelector("[data-auth-screen]")).toBeTruthy();
    expect(container.querySelector("[data-auth-flow]")).toBeTruthy();
    expect(container.querySelector("[data-auth-screen]")?.className).not.toContain("border");
    expect(container.querySelector("[data-auth-screen]")?.className).not.toContain("shadow");
    expect(container.querySelector("[data-auth-flow]")?.className).not.toContain("rounded");
    expect(container.querySelector("[data-auth-flow]")?.className).not.toContain("border");
    expect(container.querySelector("[data-auth-flow]")?.className).not.toContain("shadow");
    expect(
      container
        .querySelector("[data-vinema-brand='wordmark']")
        ?.closest("[data-auth-screen]"),
    ).toBe(container.querySelector("form")?.closest("[data-auth-screen]"));
    expect(container.querySelector("button[type='submit']")?.className).toContain("w-full");
    expect(container.textContent).not.toContain("VN");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/register");

    await submit("form");
    expect(container.textContent).toContain("Ingresa tu email.");

    await setInput("#login-email", user.email);
    await setInput("#login-password", "password-123");
    await submit("form");
    expect(container.textContent).toContain("Entrando...");
    expect(container.textContent).toContain("Correo electronico");
    expect(container.textContent).toContain("Contrasena");

    await act(async () => {
      resolveLogin?.(jsonResponse(session));
    });
    expect(routerReplace).toHaveBeenCalledWith("/");
  });

  it("Login shows credential errors", async () => {
    globalThis.fetch = createFetch([
      jsonResponse({ error: { code: "INVALID_CREDENTIALS", message: "No" } }, 401),
    ]);
    pathname = "/login";

    await render(
      <AuthProvider>
        <LoginClient />
      </AuthProvider>,
    );
    await flush();
    await setInput("#login-email", user.email);
    await setInput("#login-password", "password-123");
    await submit("form");

    expect(container.textContent).toContain("Email o contrasena incorrectos.");
  });

  it("Login offers local mode without email, password, or AuthClient requests", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(session)) as unknown as typeof fetch;
    pathname = "/login";

    await render(
      <AuthProvider>
        <LoginClient />
      </AuthProvider>,
    );
    await flush();

    expect(container.textContent).toContain("Usar sin cuenta");
    expect(container.textContent).toContain(
      "Los datos permaneceran solo en este dispositivo y no se sincronizaran.",
    );

    await clickButton("Usar sin cuenta");
    await flush();

    expect(routerReplace).toHaveBeenCalledWith("/");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("Login offers to incorporate local knowledge before entering the remote account", async () => {
    const localStorage = await createLocalIdentityWithKnowledge();
    globalThis.fetch = createFetch([jsonResponse(session)]);
    pathname = "/login";

    await render(
      <AuthProvider localAuthIdentityStorage={localStorage}>
        <LoginClient />
      </AuthProvider>,
    );
    await flush();

    await setInput("#login-email", user.email);
    await setInput("#login-password", "password-123");
    await submit("form");
    await flush();

    expect(container.textContent).toContain("Tienes conocimiento guardado en este dispositivo");
    expect(container.textContent).toContain(
      "Puedes incorporarlo a tu cuenta para sincronizarlo con tus otros dispositivos.",
    );
    expect(container.textContent).toContain("Incorporar a mi cuenta");
    expect(container.textContent).toContain("No por ahora");
    expect(routerReplace).not.toHaveBeenCalledWith("/");
  });

  it("No por ahora enters the account without changing local knowledge", async () => {
    const localStorage = await createLocalIdentityWithKnowledge();
    globalThis.fetch = createFetch([jsonResponse(session)]);
    pathname = "/login";

    await render(
      <AuthProvider localAuthIdentityStorage={localStorage}>
        <LoginClient />
      </AuthProvider>,
    );
    await flush();

    await setInput("#login-email", user.email);
    await setInput("#login-password", "password-123");
    await submit("form");
    await flush();
    await clickButton("No por ahora");
    await flush();

    expect(routerReplace).toHaveBeenCalledWith("/");
    await expect(countWorkspaceKnowledge("local-auth-workspace")).resolves.toEqual({
      nodes: 1,
      contexts: 1,
      relations: 1,
    });
    await expect(localStorage.load()).resolves.toMatchObject({
      migrationStatus: "LOCAL_PENDING",
    });
  });

  it("Register validates fields, password confirmation, duplicate email and redirects after success", async () => {
    globalThis.fetch = createFetch([
      jsonResponse({ error: { code: "EMAIL_ALREADY_EXISTS", message: "Exists" } }, 409),
      jsonResponse(session, 201),
    ]);
    pathname = "/register";

    await render(
      <AuthProvider>
        <RegisterClient />
      </AuthProvider>,
    );
    await flush();

    expect(container.textContent).toContain("Crear cuenta");
    expect(container.querySelector("[data-vinema-brand='wordmark']")).toBeTruthy();
    expect(container.querySelector("[data-auth-screen]")).toBeTruthy();
    expect(container.querySelector("[data-auth-flow]")?.className).not.toContain("border");
    expect(container.querySelector("[data-auth-flow]")?.className).not.toContain("shadow");
    expect(
      container
        .querySelector("[data-vinema-brand='wordmark']")
        ?.closest("[data-auth-screen]"),
    ).toBe(container.querySelector("form")?.closest("[data-auth-screen]"));
    expect(container.querySelector("button[type='submit']")?.className).toContain("w-full");
    expect(container.textContent).not.toContain("VN");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/login");

    await submit("form");
    expect(container.textContent).toContain("Ingresa tu nombre.");

    await setInput("#register-name", "User");
    await setInput("#register-email", "bad");
    await setInput("#register-password", "password-123");
    await setInput("#register-confirm-password", "password-123");
    await submit("form");
    expect(container.textContent).toContain("Ingresa un email valido.");

    await setInput("#register-email", user.email);
    await setInput("#register-confirm-password", "different-123");
    await submit("form");
    expect(container.textContent).toContain("Las contrasenas no coinciden.");

    await setInput("#register-confirm-password", "password-123");
    await submit("form");
    expect(container.textContent).toContain("Ese email ya esta registrado.");

    await submit("form");
    expect(routerReplace).toHaveBeenCalledWith("/");
  });

  it("Register offers the same local knowledge incorporation after account creation", async () => {
    const localStorage = await createLocalIdentityWithKnowledge();
    globalThis.fetch = createFetch([jsonResponse(session, 201)]);
    pathname = "/register";

    await render(
      <AuthProvider localAuthIdentityStorage={localStorage}>
        <RegisterClient />
      </AuthProvider>,
    );
    await flush();

    await setInput("#register-name", "User");
    await setInput("#register-email", user.email);
    await setInput("#register-password", "password-123");
    await setInput("#register-confirm-password", "password-123");
    await submit("form");
    await flush();

    expect(container.textContent).toContain("Tienes conocimiento guardado en este dispositivo");
    expect(routerReplace).not.toHaveBeenCalledWith("/");
  });

  it("AuthGuard redirects anonymous users, allows authenticated users and does not guard auth routes", async () => {
    await render(
      <AuthProvider>
        <AuthGuard>
          <p>Protected</p>
        </AuthGuard>
      </AuthProvider>,
    );
    await flush();
    expect(routerReplace).toHaveBeenCalledWith("/login");

    routerReplace.mockReset();
    pathname = "/login";
    await render(
      <AuthProvider>
        <AuthGuard>
          <p>Login public</p>
        </AuthGuard>
      </AuthProvider>,
    );
    await flush();
    expect(container.textContent).toContain("Login public");
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("configuration and form helpers normalize public API URL and classify common errors", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.test/";
    expect(getPublicApiUrl()).toBe("https://api.example.test");
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.test////";
    expect(getPublicApiUrl()).toBe("https://api.example.test");
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(getPublicApiUrl()).toBeNull();
    process.env.NEXT_PUBLIC_API_URL = "   ";
    expect(getPublicApiUrl()).toBeNull();
    expect(normalizePublicApiUrl(undefined)).toBeNull();
    expect(() => normalizePublicApiUrl("bad-url")).toThrow("NEXT_PUBLIC_API_URL");
    expect(() => normalizePublicApiUrl("ftp://api.example.test")).toThrow("NEXT_PUBLIC_API_URL");
    expect(() => normalizePublicApiUrl("http://auth")).toThrow("NEXT_PUBLIC_API_URL");
    expect(validateEmail("bad")).toBe("Ingresa un email valido.");
    expect(validatePassword("short")).toContain("al menos 8");
    expect(
      getAuthFormError(new AuthClientError("EMAIL_ALREADY_EXISTS", "Exists", 409)),
    ).toBe("Ese email ya esta registrado.");
    expect(
      getAuthFormError(new AuthClientError("DEVICE_REVOKED", "Revoked", 403)),
    ).toContain("Este dispositivo ya no tiene acceso");
  });

  it("AuthProvider reports configuration errors only when NEXT_PUBLIC_API_URL is absent", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    globalThis.fetch = vi.fn(async () => jsonResponse(session)) as unknown as typeof fetch;

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <p data-testid="status">{auth.state.status}</p>
          <p data-testid="error">{auth.error?.message ?? "none"}</p>
          <button
            type="button"
            onClick={() => {
              void auth.login({
                email: user.email,
                password: "password-123",
              }).catch(() => undefined);
            }}
          >
            Login
          </button>
        </div>
      );
    }

    await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await flush();
    expect(text("[data-testid='status']")).toBe("UNAUTHENTICATED");

    await click("button");

    expect(text("[data-testid='status']")).toBe("UNAUTHENTICATED");
    expect(text("[data-testid='error']")).toBe("La API de Vinema no esta configurada.");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("AuthProvider restores a persisted session once and stores the rotated token", async () => {
    const storage = new TrackingAuthSessionStorage();
    await storage.save({
      refreshToken: "stored-refresh-token",
      sessionId,
      deviceId,
      storedAt: "2026-07-30T12:00:00.000Z",
    });
    globalThis.fetch = createFetch([
      jsonResponse({
        ...session,
        accessToken: "restored-access-token",
        refreshToken: "rotated-refresh-token",
        sessionId: "55555555-5555-4555-8555-555555555555",
      }),
    ]);

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <p data-testid="status">{auth.state.status}</p>
          <p data-testid="token">{auth.accessToken ?? "none"}</p>
        </div>
      );
    }

    await render(
      <AuthProvider authSessionStorage={storage}>
        <Probe />
      </AuthProvider>,
    );
    await flush();

    expect(text("[data-testid='status']")).toBe("AUTHENTICATED_ONLINE");
    expect(text("[data-testid='token']")).toBe("restored-access-token");
    expect(storage.loadCalls).toBe(1);
    expect(storage.snapshot()).toMatchObject({
      refreshToken: "rotated-refresh-token",
      sessionId: "55555555-5555-4555-8555-555555555555",
      deviceId,
    });
    expect(JSON.stringify(storage.snapshot())).not.toContain("restored-access-token");
    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it("AuthProvider keeps one lifecycle through React Strict Mode effect replay", async () => {
    const storage = new TrackingAuthSessionStorage();
    await storage.save({
      refreshToken: "stored-refresh-token",
      sessionId,
      deviceId,
      storedAt: "2026-07-30T12:00:00.000Z",
    });
    globalThis.fetch = createFetch([
      jsonResponse({
        ...session,
        accessToken: "strict-restored-access-token",
        refreshToken: "strict-rotated-refresh-token",
      }),
    ]);

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <p data-testid="status">{auth.state.status}</p>
          <p data-testid="token">{auth.accessToken ?? "none"}</p>
        </div>
      );
    }

    await render(
      <React.StrictMode>
        <AuthProvider authSessionStorage={storage}>
          <Probe />
        </AuthProvider>
      </React.StrictMode>,
    );
    await flush();

    expect(text("[data-testid='status']")).toBe("AUTHENTICATED_ONLINE");
    expect(text("[data-testid='token']")).toBe("strict-restored-access-token");
    expect(storage.loadCalls).toBe(1);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it("AuthProvider keeps restoring UI until load resolves and does not redirect", async () => {
    const storage = new DeferredAuthSessionStorage();
    pathname = "/login";

    await render(
      <AuthProvider authSessionStorage={storage}>
        <AuthGuard>
          <LoginClient />
        </AuthGuard>
      </AuthProvider>,
    );

    expect(container.textContent).toContain("Restaurando sesion");
    expect(routerReplace).not.toHaveBeenCalled();

    await act(async () => {
      storage.resolveLoad(null);
    });
    await flush();

    expect(container.textContent).toContain("Iniciar sesion");
  });

  it("AuthProvider clears invalid persisted sessions without showing a technical restore error", async () => {
    const storage = new TrackingAuthSessionStorage();
    await storage.save({
      refreshToken: "stored-refresh-token",
      sessionId,
      deviceId,
      storedAt: "2026-07-30T12:00:00.000Z",
    });
    globalThis.fetch = createFetch([
      jsonResponse({ error: { code: "TOKEN_INVALID", message: "Invalid" } }, 401),
    ]);

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <p data-testid="status">{auth.state.status}</p>
          <p data-testid="error">{auth.error?.message ?? "none"}</p>
        </div>
      );
    }

    await render(
      <AuthProvider authSessionStorage={storage}>
        <Probe />
      </AuthProvider>,
    );
    await flush();

    expect(text("[data-testid='status']")).toBe("UNAUTHENTICATED");
    expect(text("[data-testid='error']")).toBe("none");
    expect(storage.snapshot()).toBeNull();
  });

  it("AuthProvider restores a previously validated session offline and revalidates when online", async () => {
    const storage = new TrackingAuthSessionStorage();
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
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(jsonResponse({
        ...session,
        accessToken: "online-again-access-token",
        refreshToken: "online-again-refresh-token",
      }));

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <p data-testid="status">{auth.state.status}</p>
          <p data-testid="authenticated">{auth.isAuthenticated ? "yes" : "no"}</p>
          <p data-testid="workspace">{auth.workspaceId ?? "none"}</p>
          <p data-testid="token">{auth.accessToken ?? "none"}</p>
        </div>
      );
    }

    await render(
      <AuthProvider authSessionStorage={storage}>
        <AuthGuard>
          <Probe />
        </AuthGuard>
      </AuthProvider>,
    );
    await flush();

    expect(text("[data-testid='status']")).toBe("AUTHENTICATED_OFFLINE");
    expect(text("[data-testid='authenticated']")).toBe("yes");
    expect(text("[data-testid='workspace']")).toBe(workspaceId);
    expect(text("[data-testid='token']")).toBe("none");
    expect(storage.snapshot()?.refreshToken).toBe("stored-refresh-token");
    expect(routerReplace).not.toHaveBeenCalledWith("/login");

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await flush();

    expect(text("[data-testid='status']")).toBe("AUTHENTICATED_ONLINE");
    expect(text("[data-testid='token']")).toBe("online-again-access-token");
    expect(storage.snapshot()?.refreshToken).toBe("online-again-refresh-token");
  });

  it("AuthProvider exits restoring immediately when opened offline with a validated local session", async () => {
    const storage = new TrackingAuthSessionStorage();
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
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });
    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <p data-testid="status">{auth.state.status}</p>
          <p data-testid="authenticated">{auth.isAuthenticated ? "yes" : "no"}</p>
          <p data-testid="workspace">{auth.workspaceId ?? "none"}</p>
        </div>
      );
    }

    await render(
      <AuthProvider authSessionStorage={storage}>
        <AuthGuard>
          <Probe />
        </AuthGuard>
      </AuthProvider>,
    );
    await flush();

    expect(container.textContent).not.toContain("Restaurando sesion");
    expect(text("[data-testid='status']")).toBe("AUTHENTICATED_OFFLINE");
    expect(text("[data-testid='authenticated']")).toBe("yes");
    expect(text("[data-testid='workspace']")).toBe(workspaceId);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalledWith("/login");
  });

  it("AuthProvider times out a pending restore request and shows the local workspace offline", async () => {
    vi.useFakeTimers();
    const storage = new TrackingAuthSessionStorage();
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
    globalThis.fetch = vi.fn(
      () =>
        new Promise<Response>(() => {
          // Keeps the remote restore pending until the explicit timeout wins.
        }),
    ) as unknown as typeof fetch;

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <p data-testid="status">{auth.state.status}</p>
          <p data-testid="workspace">{auth.workspaceId ?? "none"}</p>
        </div>
      );
    }

    await render(
      <AuthProvider authSessionStorage={storage}>
        <AuthGuard>
          <Probe />
        </AuthGuard>
      </AuthProvider>,
    );
    expect(container.textContent).toContain("Restaurando sesion");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    await flush();

    expect(container.textContent).not.toContain("Restaurando sesion");
    expect(text("[data-testid='status']")).toBe("AUTHENTICATED_OFFLINE");
    expect(text("[data-testid='workspace']")).toBe(workspaceId);
    expect(routerReplace).not.toHaveBeenCalledWith("/login");
  });

  it("AuthProvider silently refreshes an active session without leaving the authenticated UI", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T12:00:00.000Z"));
    const storage = new TrackingAuthSessionStorage();
    globalThis.fetch = createFetch([
      jsonResponse({
        ...session,
        accessToken: "login-access-token",
        accessTokenExpiresAt: "2026-07-30T12:02:00.000Z",
        refreshToken: "login-refresh-token",
      }),
      jsonResponse({
        ...session,
        accessToken: "silent-access-token",
        accessTokenExpiresAt: "2026-07-30T12:04:00.000Z",
        refreshToken: "silent-refresh-token",
        sessionId: "55555555-5555-4555-8555-555555555555",
      }),
    ]);

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <p data-testid="status">{auth.state.status}</p>
          <p data-testid="token">{auth.accessToken ?? "none"}</p>
          <button
            type="button"
            onClick={() => {
              void auth.login({
                email: user.email,
                password: "password-123",
              });
            }}
          >
            Login
          </button>
        </div>
      );
    }

    await render(
      <AuthProvider authSessionStorage={storage}>
        <Probe />
      </AuthProvider>,
    );
    await flush();

    await click("button");
    expect(text("[data-testid='status']")).toBe("AUTHENTICATED_ONLINE");
    expect(text("[data-testid='token']")).toBe("login-access-token");

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();

    expect(text("[data-testid='status']")).toBe("AUTHENTICATED_ONLINE");
    expect(text("[data-testid='token']")).toBe("silent-access-token");
    expect(storage.snapshot()).toMatchObject({
      refreshToken: "silent-refresh-token",
      sessionId: "55555555-5555-4555-8555-555555555555",
      deviceId,
    });
    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
  });

  it("AuthProvider cancels silent refresh after logout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T12:00:00.000Z"));
    globalThis.fetch = createFetch([
      jsonResponse({
        ...session,
        accessTokenExpiresAt: "2026-07-30T12:02:00.000Z",
      }),
      jsonResponse({ ok: true }),
    ]);

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <p data-testid="status">{auth.state.status}</p>
          <button
            type="button"
            onClick={() => {
              void auth.login({
                email: user.email,
                password: "password-123",
              });
            }}
          >
            Login
          </button>
          <button type="button" onClick={auth.logout}>
            Logout
          </button>
        </div>
      );
    }

    await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await flush();

    await click("button");
    expect(text("[data-testid='status']")).toBe("AUTHENTICATED_ONLINE");
    await click("button:nth-of-type(2)");
    expect(text("[data-testid='status']")).toBe("UNAUTHENTICATED");

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();

    expect((globalThis.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
  });

  async function render(element: React.ReactNode) {
    await act(async () => {
      root.render(element);
    });
  }

  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  async function click(selector: string) {
    await act(async () => {
      query<HTMLButtonElement>(selector).click();
    });
  }

  async function clickButton(label: string) {
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    if (!button) {
      throw new Error(`Missing button ${label}`);
    }

    await act(async () => {
      button.click();
    });
  }

  async function submit(selector: string) {
    await act(async () => {
      query<HTMLFormElement>(selector).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
  }

  async function setInput(selector: string, value: string) {
    await act(async () => {
      const input = query<HTMLInputElement>(selector);
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
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

  async function createLocalIdentityWithKnowledge() {
    const storage = new InMemoryLocalAuthIdentityStorage();
    const identity: StoredLocalAuthIdentity = {
      sessionMode: "local",
      active: false,
      userId: "local-auth-user",
      workspaceId: "local-auth-workspace",
      deviceId: "local-auth-device",
      sessionId: "local-auth-session",
      migrationStatus: "LOCAL_PENDING",
      createdAt: "2026-08-08T12:00:00.000Z",
      updatedAt: "2026-08-08T12:00:00.000Z",
    };
    await storage.save(identity);
    await new IndexedDbContextRepository().save({
      id: "local-auth-context",
      workspaceId: identity.workspaceId,
      type: "AREA",
      name: "Mitcom",
      description: null,
      aliases: [],
      normalizedAliases: [],
      version: 1,
      createdAt: "2026-08-08T12:01:00.000Z",
      updatedAt: "2026-08-08T12:01:00.000Z",
      archivedAt: null,
    });
    await new IndexedDbNodeRepository().create({
      id: "local-auth-node",
      workspaceId: identity.workspaceId,
      type: "NOTE",
      content: "Captura local",
      status: "ACTIVE",
      organizationStatus: "ORGANIZED",
      metadata: {},
      version: 1,
      createdAt: "2026-08-08T12:02:00.000Z",
      updatedAt: "2026-08-08T12:02:00.000Z",
      deletedAt: null,
      createdByDeviceId: identity.deviceId,
      lastModifiedByDeviceId: identity.deviceId,
    });
    await new IndexedDbNodeContextRelationRepository().save({
      id: "local-auth-relation",
      workspaceId: identity.workspaceId,
      nodeId: "local-auth-node",
      contextId: "local-auth-context",
      relationType: "CONTEXT",
      version: 1,
      createdAt: "2026-08-08T12:03:00.000Z",
    });
    return storage;
  }

  async function countWorkspaceKnowledge(workspaceId: string) {
    const [nodes, contexts, relations] = await Promise.all([
      new IndexedDbNodeRepository().listByWorkspace(workspaceId),
      new IndexedDbContextRepository().list({ workspaceId }),
      new IndexedDbNodeContextRelationRepository().listByWorkspace(workspaceId),
    ]);
    return {
      nodes: nodes.length,
      contexts: contexts.length,
      relations: relations.length,
    };
  }
});

function createFetch(responses: Response[]) {
  return vi.fn(async () => responses.shift() ?? jsonResponse({}, 500)) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

class TrackingAuthSessionStorage extends InMemoryAuthSessionStorage {
  loadCalls = 0;

  override async load() {
    this.loadCalls += 1;
    return super.load();
  }
}

class DeferredAuthSessionStorage extends InMemoryAuthSessionStorage {
  private resolver: ((value: Awaited<ReturnType<InMemoryAuthSessionStorage["load"]>>) => void) | null = null;

  override async load() {
    return new Promise<Awaited<ReturnType<InMemoryAuthSessionStorage["load"]>>>((resolve) => {
      this.resolver = resolve;
    });
  }

  resolveLoad(value: Awaited<ReturnType<InMemoryAuthSessionStorage["load"]>>) {
    this.resolver?.(value);
  }
}
