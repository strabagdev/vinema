import { isShortStructuralToken } from "@/features/associations/structural-tokens";

export function normalizeConceptDisplayLabel(value: string): string {
  const compact = value.trim().replace(/\s+/g, " ");

  if (!compact) {
    return "";
  }

  if (hasMeaningfulMixedCase(compact) || hasTechnicalShape(compact)) {
    return compact;
  }

  if (isLikelyAcronym(compact)) {
    return compact.toLocaleUpperCase();
  }

  return toSentenceCase(compact);
}

function hasMeaningfulMixedCase(value: string) {
  return /\p{Lu}/u.test(value) && /\p{Ll}/u.test(value);
}

function hasTechnicalShape(value: string) {
  return /\b\p{Lu}+-\d+[\p{Lu}0-9]*\b/u.test(value) ||
    /\b\d+\s+\p{Lu}{2,}\b/u.test(value) ||
    /\p{L}\.\p{L}/u.test(value);
}

function isLikelyAcronym(value: string) {
  const words = value.split(" ");

  if (words.length === 1) {
    return /^[\p{Lu}0-9]{2,6}$/u.test(value);
  }

  if (words.length > 3) {
    return false;
  }

  return words.every((word) => /^[\p{Lu}0-9]{2,4}$/u.test(word));
}

function toSentenceCase(value: string) {
  const lower = value.toLocaleLowerCase();
  const chars = Array.from(lower);
  const firstLetterIndex = chars.findIndex((char) => /\p{L}/u.test(char));

  if (firstLetterIndex === -1) {
    return lower;
  }

  chars[firstLetterIndex] = chars[firstLetterIndex].toLocaleUpperCase();

  return restoreStructuralTokenCasing(chars.join(""));
}

function restoreStructuralTokenCasing(value: string) {
  return value
    .split(" ")
    .map((word) => {
      const normalized = word.toLocaleLowerCase();
      if (isShortStructuralToken(normalized)) {
        return normalized;
      }

      return word;
    })
    .join(" ");
}
