import type { Context } from "@/domain/context/context";
import type { EmergingConceptSuggestion } from "@/features/associations/association-types";
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

  return createValidCapturedSelection({
    text: textarea.value.slice(start, end),
    start,
    end,
  });
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

function hasExtensiveParagraphSelection(value: string) {
  return value.split(/\n{2,}/).length > 1 || value.split("\n").length > 3;
}
