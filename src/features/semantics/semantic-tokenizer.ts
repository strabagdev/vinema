import { normalizeAssociationText } from "@/features/associations/normalize-text";

export type SemanticToken = {
  text: string;
  normalizedText: string;
  start: number;
  end: number;
  segmentId: number;
};

const SEMANTIC_TOKEN_PATTERN = /[\p{L}\p{N}]+(?:[.-][\p{L}\p{N}]+)*/gu;
const SEMANTIC_SEGMENT_BOUNDARY_PATTERN = /[.!?;¡¿\r\n]/u;

export function tokenizeSemanticText(text: string): SemanticToken[] {
  let segmentId = 0;
  let previousEnd = 0;

  return Array.from(text.matchAll(SEMANTIC_TOKEN_PATTERN), (match) => {
    const value = match[0];
    const start = match.index ?? 0;
    const separator = text.slice(previousEnd, start);

    if (SEMANTIC_SEGMENT_BOUNDARY_PATTERN.test(separator)) {
      segmentId += 1;
    }

    previousEnd = start + value.length;

    return {
      text: value,
      normalizedText: normalizeSemanticPhrase(value),
      start,
      end: start + value.length,
      segmentId,
    };
  }).filter((token) => token.normalizedText.length > 0);
}

export function normalizeSemanticPhrase(value: string) {
  return normalizeAssociationText(value).replace(/\s+/g, " ").trim();
}

export function hasSemanticUppercase(value: string) {
  return value !== value.toLocaleLowerCase();
}

export function hasTechnicalShape(value: string) {
  return (
    /^[A-Z0-9]{2,}$/.test(value) ||
    (/[A-Z]/.test(value) && /\d/.test(value)) ||
    (/[A-Z]/.test(value) && /[.-]/.test(value)) ||
    /[\p{Ll}][\p{Lu}]|[\p{Lu}]{2,}[\p{Ll}]/u.test(value)
  );
}
