import type { Context } from "@/domain/context/context";
import type { EmergingConceptSuggestion } from "@/features/associations/association-types";
import { isSpanishStopword } from "@/features/associations/spanish-stopwords";
import {
  normalizeConceptIdentityLabel,
  resolveConceptIdentity,
  type ConceptResolutionResult,
} from "@/features/concepts/concept-identity";
import { normalizeConceptDisplayLabel } from "@/features/concepts/concept-display-label";

export const MAX_CAPTURE_SELECTION_LENGTH = 120;

export type CapturedTextSelection = {
  text: string;
  normalizedText: string;
  start: number;
  end: number;
  selectionRect?: DOMRectReadOnly;
};

export type CaptureSelectionResolution = ConceptResolutionResult;

export function readValidTextareaSelection(
  textarea: HTMLTextAreaElement | null,
): CapturedTextSelection | null {
  if (!textarea || textarea.disabled) {
    return null;
  }

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;

  if (start === end || start < 0 || end < start) {
    return null;
  }

  const selection = createValidCapturedSelection({
    text: textarea.value.slice(start, end),
    start,
    end,
  });

  if (!selection) {
    return null;
  }

  return {
    ...selection,
    selectionRect: getTextareaSelectionRect(textarea, start, end),
  };
}

export function createValidCapturedSelection({
  text,
  start,
  end,
}: {
  text: string;
  start: number;
  end: number;
}): CapturedTextSelection | null {
  const trimmed = text.trim();
  const normalizedText = normalizeConceptIdentityLabel(trimmed);

  if (
    !trimmed ||
    normalizedText.length < 2 ||
    isSingleStopword(normalizedText) ||
    trimmed.length > MAX_CAPTURE_SELECTION_LENGTH ||
    isOnlyPunctuation(trimmed) ||
    hasExtensiveParagraphSelection(trimmed)
  ) {
    return null;
  }

  return {
    text: trimmed,
    normalizedText,
    start,
    end,
  };
}

export function resolveCapturedSelectionConcept(
  selection: CapturedTextSelection,
  contexts: Context[],
): CaptureSelectionResolution {
  return resolveConceptIdentity(selection.text, contexts);
}

export function createSelectionEmergingConcept(
  selection: CapturedTextSelection,
): EmergingConceptSuggestion {
  const suggestedLabel = normalizeConceptDisplayLabel(selection.text);

  return {
    kind: "emerging",
    candidateId: `selection:${selection.normalizedText}`,
    suggestedLabel,
    score: 1,
    evidenceCaptureIds: [],
    representativeTerms: selection.normalizedText.split(" "),
  };
}

function isOnlyPunctuation(value: string) {
  return !/[\p{L}\p{N}]/u.test(value);
}

function isSingleStopword(value: string) {
  return !value.includes(" ") && isSpanishStopword(value);
}

function hasExtensiveParagraphSelection(value: string) {
  return value.split(/\n{2,}/).length > 1 || value.split("\n").length > 3;
}

function getTextareaSelectionRect(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
): DOMRectReadOnly {
  const document = textarea.ownerDocument;
  const window = document.defaultView;
  const textareaRect = textarea.getBoundingClientRect();

  if (!window || textareaRect.width === 0 || textareaRect.height === 0) {
    return textareaRect;
  }

  const mirror = document.createElement("div");
  const marker = document.createElement("span");
  const style = window.getComputedStyle(textarea);

  copyTextareaGeometryStyles(mirror, style);
  mirror.style.position = "fixed";
  mirror.style.left = `${textareaRect.left - textarea.scrollLeft}px`;
  mirror.style.top = `${textareaRect.top - textarea.scrollTop}px`;
  mirror.style.width = `${textareaRect.width}px`;
  mirror.style.minHeight = `${textareaRect.height}px`;
  mirror.style.height = "auto";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.zIndex = "-1";

  marker.textContent = textarea.value.slice(start, end) || "\u200b";
  mirror.append(
    document.createTextNode(textarea.value.slice(0, start)),
    marker,
    document.createTextNode(textarea.value.slice(end) || "\u200b"),
  );

  document.body.appendChild(mirror);
  const markerRect = marker.getBoundingClientRect();
  mirror.remove();

  if (markerRect.width === 0 && markerRect.height === 0) {
    return textareaRect;
  }

  return markerRect;
}

function copyTextareaGeometryStyles(element: HTMLElement, style: CSSStyleDeclaration) {
  const properties = [
    "boxSizing",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "fontFamily",
    "fontSize",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "letterSpacing",
    "lineHeight",
    "tabSize",
    "textIndent",
    "textTransform",
    "textAlign",
    "wordSpacing",
  ] as const;

  for (const property of properties) {
    element.style[property] = style[property];
  }

  element.style.whiteSpace = "pre-wrap";
  element.style.overflowWrap = "break-word";
}
