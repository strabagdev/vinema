import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
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
import { getPublicApiUrl } from "@/features/auth/public-api-url";

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
const accessTokenExpiresAt = "2026-07-30T12:15:00.000Z";
const refreshTokenExpiresAt = "2026-08-29T12:00:00.000Z";
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
    expect(text("[data-testid='status']")).toBe("UNAUTHENTICATED");

    await click("button");
    expect(text("[data-testid='status']")).toBe("AUTHENTICATED");
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
    await click("button");
    expect(text("[data-testid='status']")).toBe("AUTHENTICATED");
    await click("button:nth-of-type(2)");
    expect(text("[data-testid='status']")).toBe("ERROR");
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

    expect(container.textContent).toContain("Iniciar sesion");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/register");

    await submit("form");
    expect(container.textContent).toContain("Ingresa tu email.");

    await setInput("#login-email", user.email);
    await setInput("#login-password", "password-123");
    await submit("form");
    expect(container.textContent).toContain("Entrando...");

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
    await setInput("#login-email", user.email);
    await setInput("#login-password", "password-123");
    await submit("form");

    expect(container.textContent).toContain("Email o contrasena incorrectos.");
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

    expect(container.textContent).toContain("Crear cuenta");
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

  it("AuthGuard redirects anonymous users, allows authenticated users and does not guard auth routes", async () => {
    await render(
      <AuthProvider>
        <AuthGuard>
          <p>Protected</p>
        </AuthGuard>
      </AuthProvider>,
    );
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
    expect(container.textContent).toContain("Login public");
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("configuration and form helpers normalize public API URL and classify common errors", () => {
    expect(getPublicApiUrl({ NEXT_PUBLIC_API_URL: "https://api.example.test/" })).toBe(
      "https://api.example.test",
    );
    expect(() => getPublicApiUrl({})).toThrow("NEXT_PUBLIC_API_URL");
    expect(validateEmail("bad")).toBe("Ingresa un email valido.");
    expect(validatePassword("short")).toContain("al menos 8");
    expect(
      getAuthFormError(new AuthClientError("EMAIL_ALREADY_EXISTS", "Exists", 409)),
    ).toBe("Ese email ya esta registrado.");
    expect(
      getAuthFormError(new AuthClientError("DEVICE_REVOKED", "Revoked", 403)),
    ).toContain("Este dispositivo ya no tiene acceso");
  });

  async function render(element: React.ReactNode) {
    await act(async () => {
      root.render(element);
    });
  }

  async function click(selector: string) {
    await act(async () => {
      query<HTMLButtonElement>(selector).click();
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
