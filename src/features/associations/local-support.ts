import {
  tokenizeAssociationText,
  uniqueTokens,
} from "@/features/associations/tokenize";
import { isShortStructuralToken } from "@/features/associations/structural-tokens";

const MIN_SINGLE_ANCHOR_LENGTH = 5;
const MIN_DISTINCTIVE_ANCHOR_TOKEN_LENGTH = 8;

export function getMeaningfulLocalSupportTokens(text: string) {
  return uniqueTokens(tokenizeAssociationText(text)).filter(
    isMeaningfulLocalSupportToken,
  );
}

export function isMeaningfulLocalSupportToken(token: string) {
  return (
    token.length >= MIN_SINGLE_ANCHOR_LENGTH &&
    !isShortStructuralToken(token)
  );
}

export function hasMeaningfulLocalTokenOverlap(first: string, second: string) {
  const firstTokens = new Set(getMeaningfulLocalSupportTokens(first));

  if (firstTokens.size === 0) {
    return false;
  }

  return hasSharedAdjacentAnchor(first, second);
}

export function hasLocalConceptIdentitySupport({
  localText,
  labels,
}: {
  localText: string;
  labels: string[];
}) {
  const localTokens = new Set(getMeaningfulLocalSupportTokens(localText));

  if (localTokens.size === 0) {
    return false;
  }

  return labels.some((label) => {
    const labelTokens = getMeaningfulLocalSupportTokens(label);

    if (labelTokens.length === 0) {
      return false;
    }

    if (labelTokens.every((token) => localTokens.has(token))) {
      return true;
    }

    return false;
  });
}

export function hasDirectionalContradiction(first: string, second: string) {
  void first;
  void second;
  return false;
}

function hasSharedAdjacentAnchor(first: string, second: string) {
  const firstPhrases = new Set(createAdjacentAnchors(first));
  if (firstPhrases.size === 0) {
    return false;
  }

  return createAdjacentAnchors(second).some(
    (phrase) => firstPhrases.has(phrase) && hasDistinctiveAnchorToken(phrase),
  );
}

function createAdjacentAnchors(text: string) {
  const words = tokenizeAssociationText(text).filter(isMeaningfulLocalSupportToken);
  const anchors: string[] = [];

  for (let index = 0; index < words.length - 1; index += 1) {
    const first = words[index] ?? "";
    const second = words[index + 1] ?? "";

    if (isMeaningfulLocalSupportToken(first) && isMeaningfulLocalSupportToken(second)) {
      anchors.push(normalizeAnchorPair(first, second));
    }
  }

  return anchors;
}

function normalizeAnchorPair(first: string, second: string) {
  return `${first} ${second}`;
}

function hasDistinctiveAnchorToken(phrase: string) {
  return phrase
    .split(" ")
    .some((token) => token.length >= MIN_DISTINCTIVE_ANCHOR_TOKEN_LENGTH);
}
