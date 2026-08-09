import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateSelectionPopoverPosition,
  CaptureSelectionAction,
} from "@/features/capture/capture-selection-action";
import type { CapturedTextSelection } from "@/features/capture/capture-selection";

describe("selection concept popover positioning", () => {
  let originalGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect;
  let roots: Root[];

  beforeEach(() => {
    roots = [];
    originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 800,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 600,
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const root of roots) {
      root.unmount();
    }

    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("places its bottom edge 8 px above the selected text without overlap", () => {
    const selectionRect = rect({ left: 300, top: 220, width: 80, height: 20 });
    const panelSize = { width: 200, height: 40 };
    const position = calculateSelectionPopoverPosition({
      selectionRect,
      panelSize,
      boundaryRect: rect({ left: 0, top: 0, width: 800, height: 600 }),
    });
    const popoverBottom = position.top + panelSize.height;

    expect(position).toEqual({
      left: 240,
      top: 172,
      placement: "top",
    });
    expect(popoverBottom).toBe(selectionRect.top - 8);
    expect(popoverBottom).toBeLessThan(selectionRect.top);
    expect(popoverBottom <= selectionRect.top).toBe(true);
  });

  it("falls back completely below the selection with 8 px of separation", () => {
    const selectionRect = rect({ left: 300, top: 20, width: 80, height: 20 });
    const position = calculateSelectionPopoverPosition({
      selectionRect,
      panelSize: { width: 200, height: 40 },
      boundaryRect: rect({ left: 0, top: 0, width: 800, height: 600 }),
    });

    expect(position).toEqual({
      left: 240,
      top: 48,
      placement: "bottom",
    });
    expect(position.top).toBe(selectionRect.bottom + 8);
    expect(position.top).toBeGreaterThan(selectionRect.bottom);
  });

  it("uses the visual top of a multiline selection when placing above it", () => {
    const selectionRect = rect({ left: 260, top: 220, width: 180, height: 72 });
    const panelSize = { width: 200, height: 40 };
    const position = calculateSelectionPopoverPosition({
      selectionRect,
      panelSize,
      boundaryRect: rect({ left: 0, top: 0, width: 800, height: 600 }),
    });

    expect(position.placement).toBe("top");
    expect(position.top + panelSize.height).toBe(selectionRect.top - 8);
    expect(position.top + panelSize.height).toBeLessThan(selectionRect.top);
  });

  it("keeps the popover inside the visible horizontal limits", () => {
    const leftEdge = calculateSelectionPopoverPosition({
      selectionRect: rect({ left: 104, top: 220, width: 20, height: 20 }),
      panelSize: { width: 240, height: 40 },
      boundaryRect: rect({ left: 100, top: 0, width: 400, height: 600 }),
    });
    const rightEdge = calculateSelectionPopoverPosition({
      selectionRect: rect({ left: 480, top: 220, width: 20, height: 20 }),
      panelSize: { width: 240, height: 40 },
      boundaryRect: rect({ left: 100, top: 0, width: 400, height: 600 }),
    });

    expect(leftEdge.left).toBe(108);
    expect(rightEdge.left).toBe(252);
  });

  it("repositions from the live textarea selection after internal scroll", async () => {
    let markerRect = rect({ left: 280, top: 220, width: 80, height: 20 });
    const { root, textarea } = renderPopover({
      selection: selectionWithRect(markerRect),
      getElementRect: (element) => {
        if (element instanceof HTMLTextAreaElement) {
          return rect({ left: 100, top: 100, width: 500, height: 300 });
        }

        if (element.getAttribute("data-capture-selection-action") !== null) {
          return rect({ left: 0, top: 0, width: 200, height: 40 });
        }

        if (element.tagName === "SPAN") {
          return markerRect;
        }

        return rect({ left: 0, top: 0, width: 0, height: 0 });
      },
    });
    roots.push(root);

    expect(getPopover().style.top).toBe("172px");

    markerRect = rect({ left: 280, top: 140, width: 80, height: 20 });
    textarea.scrollTop = 80;

    await act(async () => {
      textarea.dispatchEvent(new Event("scroll", { bubbles: true }));
      await flushPromises();
    });

    expect(getPopover().style.top).toBe("92px");
  });

  it("keeps the final measured popover rectangle above the selection after content grows", async () => {
    const selectionRect = rect({ left: 280, top: 220, width: 80, height: 20 });
    let panelHeight = 40;
    const { root, textarea } = renderPopover({
      selection: selectionWithRect(selectionRect),
      getElementRect: (element) => {
        if (element instanceof HTMLTextAreaElement) {
          return rect({ left: 100, top: 100, width: 500, height: 300 });
        }

        if (element.getAttribute("data-capture-selection-action") !== null) {
          const top = Number.parseFloat(element.style.top || "0");
          const left = Number.parseFloat(element.style.left || "0");

          return rect({ left, top, width: 200, height: panelHeight });
        }

        if (element.tagName === "SPAN") {
          return selectionRect;
        }

        return rect({ left: 0, top: 0, width: 0, height: 0 });
      },
    });
    roots.push(root);

    expect(getPopover().getBoundingClientRect().bottom).toBe(selectionRect.top - 8);

    panelHeight = 96;

    await act(async () => {
      root.render(
        createElement(CaptureSelectionAction, {
          selection: selectionWithRect(selectionRect),
          resolution: { status: "NEW", matchedText: "Mitcom" },
          processing: false,
          touch: false,
          anchorElement: textarea,
          onCapture: vi.fn(),
          onConfirmNew: vi.fn(),
          onChoose: vi.fn(),
          onCancel: vi.fn(),
        }),
      );
      await flushPromises();
    });

    const finalPopoverRect = getPopover().getBoundingClientRect();

    expect(finalPopoverRect.bottom).toBe(selectionRect.top - 8);
    expect(finalPopoverRect.bottom).toBeLessThan(selectionRect.top);
    expect(finalPopoverRect.bottom <= selectionRect.top - 8).toBe(true);
  });

  it("keeps the textarea selection while interacting with the popover", async () => {
    const { root, textarea } = renderPopover({
      selection: selectionWithRect(rect({ left: 280, top: 220, width: 80, height: 20 })),
      getElementRect: (element) => {
        if (element.getAttribute("data-capture-selection-action") !== null) {
          return rect({ left: 0, top: 0, width: 200, height: 40 });
        }

        return rect({ left: 0, top: 0, width: 500, height: 300 });
      },
    });
    roots.push(root);
    textarea.setSelectionRange(8, 14);

    const pointerEvent =
      typeof PointerEvent === "undefined"
        ? new MouseEvent("pointerdown", { bubbles: true, cancelable: true })
        : new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
          });
    const cancelled = !getPopover().dispatchEvent(pointerEvent);

    expect(cancelled).toBe(true);
    expect(pointerEvent.defaultPrevented).toBe(true);
    expect(textarea.selectionStart).toBe(8);
    expect(textarea.selectionEnd).toBe(14);
  });
});

function renderPopover({
  selection,
  getElementRect,
}: {
  selection: CapturedTextSelection;
  getElementRect: (element: HTMLElement) => DOMRectReadOnly;
}) {
  const container = document.createElement("div");
  const textarea = document.createElement("textarea");
  const root = createRoot(container);

  textarea.value = "Revisar Mitcom manana";
  textarea.setSelectionRange(selection.start, selection.end);
  container.appendChild(textarea);
  document.body.appendChild(container);

  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return getElementRect(this);
  };

  act(() => {
    root.render(
      createElement(CaptureSelectionAction, {
        selection,
        resolution: null,
        processing: false,
        touch: false,
        anchorElement: textarea,
        onCapture: vi.fn(),
        onConfirmNew: vi.fn(),
        onChoose: vi.fn(),
        onCancel: vi.fn(),
      }),
    );
  });

  return { root, textarea };
}

function getPopover() {
  return document.body.querySelector<HTMLElement>("[data-capture-selection-action]")!;
}

function selectionWithRect(selectionRect: DOMRectReadOnly): CapturedTextSelection {
  return {
    text: "Mitcom",
    normalizedText: "mitcom",
    start: 8,
    end: 14,
    selectionRect,
  };
}

function rect({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRectReadOnly {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
