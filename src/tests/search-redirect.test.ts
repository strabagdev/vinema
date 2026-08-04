import { act, createElement } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchRedirectClient } from "@/app/search/search-redirect-client";
import { LegacyMemoryRouteRedirect } from "@/components/app-shell/legacy-memory-route-redirect";
import { SidebarContent } from "@/components/app-shell/app-sidebar";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
  }),
  useSearchParams: () => mocks.searchParams,
  usePathname: () => "/",
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("search route consolidation", () => {
  afterEach(() => {
    mocks.replace.mockClear();
    mocks.searchParams = new URLSearchParams();
    document.body.replaceChildren();
  });

  it("redirects /search to Memoria", async () => {
    await render(createElement(SearchRedirectClient));

    expect(mocks.replace).toHaveBeenCalledWith("/memory");
  });

  it("preserves historical q params and special characters", async () => {
    mocks.searchParams = new URLSearchParams("q=mitcom%20%28A%29%20%2B");

    await render(createElement(SearchRedirectClient));

    expect(mocks.replace).toHaveBeenCalledWith("/memory?q=mitcom%20(A)%20%2B");
  });

  it("redirects legacy /notes routes to Memoria while preserving query params", async () => {
    mocks.searchParams = new URLSearchParams("q=mitcom");

    await render(createElement(LegacyMemoryRouteRedirect, { target: "/memory" }));

    expect(mocks.replace).toHaveBeenCalledWith("/memory?q=mitcom");
  });

  it("does not expose separate search or global exploration entries in the sidebar", async () => {
    const screen = await render(createElement(SidebarContent));

    expect(screen.querySelector("a[aria-label='Vinema']")?.getAttribute("href")).toBe("/");
    expect(screen.querySelector("[data-vinema-brand='monogram']")).toBeTruthy();
    expect(screen.textContent).not.toContain("VN");
    expect(screen.textContent).not.toContain("Explorar");
    expect(screen.textContent).not.toContain("Buscar");
    expect(
      Array.from(screen.querySelectorAll("a")).some(
        (link) => link.getAttribute("href") === "/search",
      ),
    ).toBe(false);
  });
});

async function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);

  await act(async () => {
    createRoot(container).render(element);
    await Promise.resolve();
  });

  return container;
}
