import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { AuthScreen } from "@/app/login/login-client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("AuthScreen layout", () => {
  it("renders wordmark and form content in one minimalist column without an exterior card", async () => {
    const container = document.createElement("div");
    document.body.replaceChildren(container);

    await act(async () => {
      createRoot(container).render(
        createElement(
          AuthScreen,
          {
            title: "Inicia sesion",
            description: "Accede a tu memoria.",
          } as ComponentProps<typeof AuthScreen>,
          createElement(
            "form",
            { "aria-label": "Formulario de acceso" },
            createElement("button", { type: "submit", className: "w-full" }, "Entrar"),
          ),
        ),
      );
      await Promise.resolve();
    });

    const screen = container.querySelector("[data-auth-screen]");
    const flow = container.querySelector("[data-auth-flow]");
    const wordmark = container.querySelector("[data-vinema-brand='wordmark']");
    const form = container.querySelector("form");
    const submit = container.querySelector("button[type='submit']");

    expect(screen).toBeTruthy();
    expect(flow).toBeTruthy();
    expect(wordmark?.closest("[data-auth-screen]")).toBe(screen);
    expect(form?.closest("[data-auth-screen]")).toBe(screen);
    expect(flow?.className).not.toContain("border");
    expect(flow?.className).not.toContain("shadow");
    expect(flow?.className).not.toContain("rounded");
    expect(screen?.className).not.toContain("border");
    expect(screen?.className).not.toContain("shadow");
    expect(submit?.className).toContain("w-full");
    expect(container.textContent).toContain("Inicia sesion");
    expect(container.textContent).toContain("Accede a tu memoria.");
  });
});
