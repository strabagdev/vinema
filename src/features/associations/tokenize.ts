import {
  normalizeAssociationText,
  stemSpanishToken,
} from "@/features/associations/normalize-text";
import { SPANISH_STOPWORDS } from "@/features/associations/spanish-stopwords";

export const MIN_ASSOCIATION_TOKEN_LENGTH = 3;

export function tokenizeAssociationText(value: string) {
  return normalizeAssociationText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= MIN_ASSOCIATION_TOKEN_LENGTH)
    .filter((token) => !SPANISH_STOPWORDS.has(token))
    .map(stemSpanishToken)
    .filter((token) => token.length >= MIN_ASSOCIATION_TOKEN_LENGTH);
}

export function uniqueTokens(tokens: string[]) {
  return Array.from(new Set(tokens));
}
