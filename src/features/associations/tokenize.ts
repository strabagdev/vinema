import {
  normalizeAssociationToken,
  normalizeAssociationText,
} from "@/features/associations/normalize-text";
import { isShortStructuralToken } from "@/features/associations/structural-tokens";

export const MIN_ASSOCIATION_TOKEN_LENGTH = 3;

export function tokenizeAssociationText(value: string) {
  return normalizeAssociationText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= MIN_ASSOCIATION_TOKEN_LENGTH)
    .filter((token) => !isShortStructuralToken(token))
    .map(normalizeAssociationToken)
    .filter((token) => token.length >= MIN_ASSOCIATION_TOKEN_LENGTH);
}

export function uniqueTokens(tokens: string[]) {
  return Array.from(new Set(tokens));
}
