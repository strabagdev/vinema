"use client";

export const CANVAS_EDITOR_INITIAL_ANCHOR = "42%";
export const CANVAS_EDITOR_INITIAL_ANCHOR_RATIO = 0.42;
export const CANVAS_CARET_VISUAL_FOLLOW_RATIO = 0.7;

export type CaretOffsetMeasure = (textarea: HTMLTextAreaElement) => number;

export function createTextareaCaretFollower({
  getTextarea,
  measureCaretOffset = measureTextareaCaretOffset,
}: {
  getTextarea: () => HTMLTextAreaElement | null;
  measureCaretOffset?: CaretOffsetMeasure;
}) {
  let autoScrollInProgress = false;
  let suspended = false;
  let frame: number | null = null;

  function follow(reactivate: boolean) {
    if (reactivate) {
      suspended = false;
    }

    if (suspended) {
      return;
    }

    if (frame !== null) {
      window.cancelAnimationFrame(frame);
    }

    frame = window.requestAnimationFrame(() => {
      frame = null;
      const textarea = getTextarea();

      if (!textarea) {
        return;
      }

      autoScrollInProgress = followTextareaCaret(textarea, measureCaretOffset);

      if (autoScrollInProgress) {
        window.setTimeout(() => {
          autoScrollInProgress = false;
        }, 80);
      }
    });
  }

  return {
    follow,
    handleScroll() {
      if (!autoScrollInProgress) {
        suspended = true;
      }
    },
    isSuspended() {
      return suspended;
    },
    dispose() {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
    },
  };
}

export function followTextareaCaret(
  textarea: HTMLTextAreaElement,
  measureCaretOffset: CaretOffsetMeasure = measureTextareaCaretOffset,
) {
  const viewport = getCanvasScrollViewport(textarea);

  if (!viewport) {
    return false;
  }

  return followCaretInScrollViewport({
    viewport,
    editor: textarea,
    caretOffset: measureCaretOffset(textarea),
  });
}

export function followCaretInScrollViewport({
  viewport,
  editor,
  caretOffset,
}: {
  viewport: HTMLElement;
  editor: HTMLElement;
  caretOffset: number;
}) {
  const visibleHeight = viewport.clientHeight;

  if (visibleHeight <= 0) {
    return false;
  }

  const editorTop = getOffsetTopWithin(editor, viewport);
  const caretTop = editorTop + caretOffset - viewport.scrollTop;
  const followLine = visibleHeight * CANVAS_CARET_VISUAL_FOLLOW_RATIO;

  if (caretTop <= followLine) {
    return false;
  }

  const maxScrollTop = Math.max(0, viewport.scrollHeight - visibleHeight);
  const nextScrollTop = Math.min(
    maxScrollTop,
    viewport.scrollTop + (caretTop - followLine),
  );

  if (Math.abs(nextScrollTop - viewport.scrollTop) < 1) {
    return false;
  }

  viewport.scrollTop = nextScrollTop;

  return true;
}

function getCanvasScrollViewport(textarea: HTMLTextAreaElement) {
  const viewport = textarea.closest("[data-canvas-scroll-viewport]");

  if (viewport instanceof HTMLElement) {
    return viewport;
  }

  return textarea;
}

function getOffsetTopWithin(element: HTMLElement, ancestor: HTMLElement) {
  let offset = 0;
  let current: HTMLElement | null = element;

  while (current && current !== ancestor) {
    offset += current.offsetTop;
    current = current.offsetParent instanceof HTMLElement
      ? current.offsetParent
      : null;
  }

  if (current === ancestor) {
    return offset;
  }

  return element.getBoundingClientRect().top - ancestor.getBoundingClientRect().top;
}

export function measureTextareaCaretOffset(textarea: HTMLTextAreaElement) {
  const selectionStart = textarea.selectionStart ?? textarea.value.length;
  const computedStyle = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const caret = document.createElement("span");
  const textBeforeCaret = textarea.value.slice(0, selectionStart);

  mirror.setAttribute("aria-hidden", "true");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.wordBreak = computedStyle.wordBreak;
  mirror.style.boxSizing = computedStyle.boxSizing;
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.fontFamily = computedStyle.fontFamily;
  mirror.style.fontSize = computedStyle.fontSize;
  mirror.style.fontWeight = computedStyle.fontWeight;
  mirror.style.fontStyle = computedStyle.fontStyle;
  mirror.style.letterSpacing = computedStyle.letterSpacing;
  mirror.style.lineHeight = computedStyle.lineHeight;
  mirror.style.paddingTop = computedStyle.paddingTop;
  mirror.style.paddingRight = computedStyle.paddingRight;
  mirror.style.paddingBottom = computedStyle.paddingBottom;
  mirror.style.paddingLeft = computedStyle.paddingLeft;
  mirror.style.borderTopWidth = computedStyle.borderTopWidth;
  mirror.style.borderRightWidth = computedStyle.borderRightWidth;
  mirror.style.borderBottomWidth = computedStyle.borderBottomWidth;
  mirror.style.borderLeftWidth = computedStyle.borderLeftWidth;

  mirror.textContent = textBeforeCaret;
  caret.textContent = "\u200b";
  mirror.append(caret);
  document.body.append(mirror);

  const offset = caret.offsetTop;
  mirror.remove();

  return offset;
}
