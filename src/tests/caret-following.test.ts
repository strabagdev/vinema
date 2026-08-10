import { describe, expect, it, vi } from "vitest";
import {
  CANVAS_CARET_VISUAL_FOLLOW_RATIO,
  CANVAS_EDITOR_INITIAL_ANCHOR,
  createTextareaCaretFollower,
  followCaretInScrollViewport,
  followTextareaCaret,
} from "@/features/canvas/caret-following";

describe("canvas caret following", () => {
  it("keeps the initial editor anchor slightly below the old center point", () => {
    expect(CANVAS_EDITOR_INITIAL_ANCHOR).toBe("42%");
  });

  it("lets the caret move naturally between the initial anchor and the threshold", () => {
    const { viewport, editor } = createMeasuredCanvas({
      viewportHeight: 500,
      viewportScrollHeight: 900,
      editorTop: 200,
      scrollTop: 0,
    });

    const changed = followCaretInScrollViewport({
      viewport,
      editor,
      caretOffset: 120,
    });

    expect(changed).toBe(false);
    expect(viewport.scrollTop).toBe(0);
  });

  it("scrolls the full canvas viewport once the caret passes seventy percent", () => {
    const { viewport, editor } = createMeasuredCanvas({
      viewportHeight: 500,
      viewportScrollHeight: 900,
      editorTop: 200,
      scrollTop: 0,
    });

    const changed = followCaretInScrollViewport({
      viewport,
      editor,
      caretOffset: 220,
    });

    expect(CANVAS_CARET_VISUAL_FOLLOW_RATIO).toBe(0.7);
    expect(changed).toBe(true);
    expect(viewport.scrollTop).toBe(70);
    expect(editor.scrollTop).toBe(0);
  });

  it("keeps moving older content up across additional lines", () => {
    const { viewport, editor } = createMeasuredCanvas({
      viewportHeight: 500,
      viewportScrollHeight: 900,
      editorTop: 200,
      scrollTop: 0,
    });

    followCaretInScrollViewport({ viewport, editor, caretOffset: 220 });
    const firstScrollTop = viewport.scrollTop;
    followCaretInScrollViewport({ viewport, editor, caretOffset: 270 });

    expect(firstScrollTop).toBe(70);
    expect(viewport.scrollTop).toBe(120);
  });

  it("does not depend on textarea native overflow", () => {
    const { viewport, editor } = createMeasuredCanvas({
      viewportHeight: 500,
      viewportScrollHeight: 900,
      editorTop: 200,
      scrollTop: 0,
    });

    Object.defineProperty(editor, "scrollHeight", {
      configurable: true,
      value: 120,
    });

    followCaretInScrollViewport({ viewport, editor, caretOffset: 260 });

    expect(viewport.scrollTop).toBe(110);
    expect(editor.scrollTop).toBe(0);
  });

  it("suspends after manual viewport scroll and reactivates on the next writing input", () => {
    vi.useFakeTimers();
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const { viewport, editor } = createMeasuredCanvas({
      viewportHeight: 500,
      viewportScrollHeight: 900,
      editorTop: 200,
      scrollTop: 0,
    });
    const follower = createTextareaCaretFollower({
      getTextarea: () => editor,
      measureCaretOffset: () => 220,
    });

    viewport.setAttribute("data-canvas-scroll-viewport", "");
    viewport.append(editor);
    follower.handleScroll();
    expect(follower.isSuspended()).toBe(true);

    follower.follow(false);
    expect(viewport.scrollTop).toBe(0);

    follower.follow(true);
    expect(follower.isSuspended()).toBe(false);
    expect(viewport.scrollTop).toBe(70);

    follower.dispose();
    vi.runOnlyPendingTimers();
    raf.mockRestore();
    cancel.mockRestore();
    vi.useRealTimers();
  });

  it("uses measured visual caret offsets, so wrapping can drive the viewport scroll", () => {
    const { viewport, editor } = createMeasuredCanvas({
      viewportHeight: 320,
      viewportScrollHeight: 760,
      editorTop: 128,
      scrollTop: 24,
    });

    followCaretInScrollViewport({
      viewport,
      editor,
      caretOffset: 180,
    });

    expect(viewport.scrollTop).toBe(84);
  });

  it("falls back from textarea to the outer scroll viewport", () => {
    const { viewport, editor } = createMeasuredCanvas({
      viewportHeight: 500,
      viewportScrollHeight: 900,
      editorTop: 200,
      scrollTop: 0,
    });

    viewport.setAttribute("data-canvas-scroll-viewport", "");
    viewport.append(editor);

    const changed = followTextareaCaret(editor, () => 220);

    expect(changed).toBe(true);
    expect(viewport.scrollTop).toBe(70);
    expect(editor.scrollTop).toBe(0);
  });
});

function createMeasuredCanvas({
  viewportHeight,
  viewportScrollHeight,
  editorTop,
  scrollTop,
}: {
  viewportHeight: number;
  viewportScrollHeight: number;
  editorTop: number;
  scrollTop: number;
}) {
  const viewport = document.createElement("div");
  const editor = document.createElement("textarea");

  Object.defineProperty(viewport, "clientHeight", {
    configurable: true,
    value: viewportHeight,
  });
  Object.defineProperty(viewport, "scrollHeight", {
    configurable: true,
    value: viewportScrollHeight,
  });
  Object.defineProperty(viewport, "scrollTop", {
    configurable: true,
    writable: true,
    value: scrollTop,
  });
  Object.defineProperty(editor, "scrollTop", {
    configurable: true,
    writable: true,
    value: 0,
  });

  viewport.getBoundingClientRect = () => ({
    bottom: viewportHeight,
    height: viewportHeight,
    left: 0,
    right: 920,
    top: 0,
    width: 920,
    x: 0,
    y: 0,
    toJSON: () => undefined,
  });
  editor.getBoundingClientRect = () => ({
    bottom: editorTop + 40,
    height: 40,
    left: 0,
    right: 920,
    top: editorTop,
    width: 920,
    x: 0,
    y: editorTop,
    toJSON: () => undefined,
  });

  return { viewport, editor };
}
