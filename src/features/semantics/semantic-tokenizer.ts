import { normalizeAssociationText } from "@/features/associations/normalize-text";

export type SemanticToken = {
  text: string;
  normalizedText: string;
  start: number;
  end: number;
};

const SEMANTIC_TOKEN_PATTERN = /[\p{L}\p{N}]+(?:[.-][\p{L}\p{N}]+)*/gu;

export function tokenizeSemanticText(text: string): SemanticToken[] {
  return Array.from(text.matchAll(SEMANTIC_TOKEN_PATTERN), (match) => {
    const value = match[0];
    const start = match.index ?? 0;

    return {
      text: value,
      normalizedText: normalizeSemanticPhrase(value),
      start,
      end: start + value.length,
    };
  }).filter((token) => token.normalizedText.length > 0);
}

export function normalizeSemanticPhrase(value: string) {
  return normalizeAssociationText(value).replace(/\s+/g, " ").trim();
}

export function hasSemanticUppercase(value: string) {
  return value !== value.toLocaleLowerCase("es");
}

export function hasTechnicalShape(value: string) {
  return (
    /[A-Z]/.test(value) &&
    (/[a-z]/.test(value) || /\d/.test(value) || /[.-]/.test(value))
  );
}
