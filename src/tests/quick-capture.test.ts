import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell/app-shell";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  pathname: "/notes",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({
    push: mocks.push,
  }),
}));

let currentRoot: Root | null = null;

describe("Global writing entry", () => {
  beforeEach(() => {
    mocks.pathname = "/notes";
    mocks.push.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      currentRoot?.unmount();
      await flushPromises();
    });
    currentRoot = null;
    document.body.replaceChildren();
  });

  it("sends the global action to the single writing surface", async () => {
    const { container } = await renderAppShell();

    await click(getWritingButton(container));

    expect(mocks.push).toHaveBeenCalledWith("/#capture");
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(document.querySelector("#quick-capture-editor")).toBeNull();
  });

  it("uses Ctrl/Cmd+Shift+K to focus writing without opening a second editor", async () => {
    await renderAppShell();

    await keydown({ key: "K", ctrlKey: true, shiftKey: true });

    expect(mocks.push).toHaveBeenCalledWith("/#capture");
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(document.querySelector("#quick-capture-editor")).toBeNull();
  });

  it("dispatches focus when the user is already on Inicio", async () => {
    mocks.pathname = "/";
    const { container } = await renderAppShell();
    const focusEvents: string[] = [];
    window.addEventListener("vinema:focus-capture", () => {
      focusEvents.push("focus");
    });

    await click(getWritingButton(container));

    expect(mocks.push).not.toHaveBeenCalled();
    expect(focusEvents).toEqual(["focus"]);
  });

  it("does not steal shortcuts from editable fields", async () => {
    const { container } = await renderAppShell();
    const input = document.createElement("input");
    container.append(input);
    input.focus();

    await keydown({ key: "K", metaKey: true, shiftKey: true, target: input });

    expect(mocks.push).not.toHaveBeenCalled();
  });
});

async function renderAppShell() {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  let root: Root | null = null;

  await act(async () => {
    root = createRoot(container);
    root.render(createElement(AppShell, null, createElement("div", null, "Ruta")));
    await flushPromises();
  });

  currentRoot = root;
  if (!root) {
    throw new Error("Root was not created");
  }

  return { container, root };
}

function getWritingButton(container: HTMLElement) {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      "button[aria-label='Empezar a escribir']",
    ),
  )[0];

  if (!button) {
    throw new Error("Writing button not found");
  }

  return button;
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
    await flushPromises();
  });
}

async function keydown({
  key,
  ctrlKey = false,
  metaKey = false,
  shiftKey = false,
  target = window,
}: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  target?: Window | HTMLElement | Document;
}) {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key,
        ctrlKey,
        metaKey,
        shiftKey,
      }),
    );
    await flushPromises();
  });
}

async function flushPromises() {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}
