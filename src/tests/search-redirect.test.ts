import { act, createElement } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchRedirectClient } from "@/app/search/search-redirect-client";
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

  it("redirects /search to the Knowledge Base", async () => {
    await render(createElement(SearchRedirectClient));

    expect(mocks.replace).toHaveBeenCalledWith("/notes");
  });

  it("preserves historical q params and special characters", async () => {
    mocks.searchParams = new URLSearchParams("q=mitcom%20%28A%29%20%2B");

    await render(createElement(SearchRedirectClient));

    expect(mocks.replace).toHaveBeenCalledWith("/notes?q=mitcom%20(A)%20%2B");
  });

  it("does not expose a separate search entry in the sidebar", async () => {
    const screen = await render(createElement(SidebarContent, { pathname: "/" }));

    expect(screen.textContent).toContain("Inicio");
    expect(screen.textContent).toContain("Explorar");
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
