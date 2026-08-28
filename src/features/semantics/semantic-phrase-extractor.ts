import { normalizeAssociationToken } from "@/features/associations/normalize-text";
import { isShortStructuralToken } from "@/features/associations/structural-tokens";
import {
  hasSemanticUppercase,
  hasTechnicalShape,
  normalizeSemanticPhrase,
  tokenizeSemanticText,
  type SemanticToken,
} from "@/features/semantics/semantic-tokenizer";

export type SemanticPhraseCandidate = {
  text: string;
  normalizedText: string;
  tokens: string[];
  start: number;
  end: number;
  source:
    | "KNOWN_TERM"
    | "PROPER_NOUN_PHRASE"
    | "CAPITALIZED_PHRASE"
    | "NOUN_PHRASE"
    | "GENERAL_NOUN_PHRASE"
    | "HISTORICAL_EVIDENCE";
  score: number;
  reasons: string[];
};

const MAX_SEMANTIC_SUGGESTIONS = 12;

export function extractSemanticPhraseCandidates(text: string) {
  const tokens = tokenizeSemanticText(text);
  const candidates = new Map<string, SemanticPhraseCandidate>();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (!token) {
      continue;
    }

    const candidate = createSingleTokenCandidate({
      token,
      previousToken: tokens[index - 1],
      nextToken: tokens[index + 1],
      index,
    });
    if (candidate) {
      upsertCandidate(candidates, candidate);
    }
  }

  for (const size of [2, 3, 4]) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const phraseTokens = tokens.slice(index, index + size);

      if (!isWithinSingleSegment(phraseTokens)) {
        continue;
      }

      const candidate = createPhraseCandidate({
        phraseTokens,
        previousToken: tokens[index - 1],
        nextToken: tokens[index + size],
      });
      if (candidate) {
        upsertCandidate(candidates, candidate);
      }
    }
  }

  for (const candidate of createDerivedVerbAdverbCandidates(tokens)) {
    upsertCandidate(candidates, candidate);
  }

  return suppressContainedCandidates(Array.from(candidates.values()))
    .sort(compareSemanticCandidates)
    .slice(0, MAX_SEMANTIC_SUGGESTIONS);
}

function createSingleTokenCandidate({
  token,
  previousToken,
  nextToken,
  index,
}: {
  token: SemanticToken;
  previousToken?: SemanticToken;
  nextToken?: SemanticToken;
  index: number;
}): SemanticPhraseCandidate | null {
  const normalized = normalizeSemanticPhrase(token.text);
  const isTechnical = hasTechnicalShape(token.text);
  const isProper =
    token.start > 0 &&
    hasSemanticUppercase(token.text) &&
    !isLikelySentenceInitialOnly(token, previousToken);

  const isSalientSingleNoun = isSalientAbstractSingleNoun({
    token,
    previousToken,
    nextToken,
    index,
  });

  if (!isTechnical && !isProper && !isSalientSingleNoun) {
    return null;
  }

  if (isShortBoundaryToken(normalized)) {
    return null;
  }

  const text =
    isSalientSingleNoun ? capitalizeTerm(token.text.toLocaleLowerCase()) : token.text;

  return {
    text,
    normalizedText: normalizeSemanticPhrase(text),
    tokens: [stemSemanticToken(normalized)],
    start: token.start,
    end: token.end,
    source:
      isTechnical
        ? "KNOWN_TERM"
        : isSalientSingleNoun
          ? "GENERAL_NOUN_PHRASE"
          : "CAPITALIZED_PHRASE",
    score: isTechnical ? 0.7 : isSalientSingleNoun ? 0.58 : 0.5,
    reasons: [
      isTechnical
          ? "technical-shape"
          : isSalientSingleNoun
            ? "salient-abstract-noun"
            : "capitalized-single-token",
    ],
  };
}

function createPhraseCandidate({
  phraseTokens,
  previousToken,
  nextToken,
}: {
  phraseTokens: SemanticToken[];
  previousToken?: SemanticToken;
  nextToken?: SemanticToken;
}): SemanticPhraseCandidate | null {
  const normalizedValues = phraseTokens.map((token) => token.normalizedText);
  const first = normalizedValues[0] ?? "";
  const last = normalizedValues[normalizedValues.length - 1] ?? "";

  const visiblyProperPhrase = phraseTokens
    .filter((token) => !isSemanticConnector(token.normalizedText))
    .every((token) => hasSemanticUppercase(token.text) || hasTechnicalShape(token.text));

  if (
    isShortBoundaryToken(first) ||
    isShortBoundaryToken(last)
  ) {
    return null;
  }

  if (startsWithSentenceInitialConnectorFragment(phraseTokens, previousToken)) {
    return null;
  }

  if (isTemporalComplementFragment(normalizedValues)) {
    return null;
  }

  if (!visiblyProperPhrase && isConjugatedVerbArticleNounPhrase(normalizedValues)) {
    return null;
  }

  if (!visiblyProperPhrase && isConjugatedVerbInfinitivePhrase(normalizedValues)) {
    return null;
  }

  const meaningfulTokens = normalizedValues.filter(
    (value) => !isSemanticConnector(value),
  );

  if (meaningfulTokens.length < 2) {
    return null;
  }

  const phraseText = phraseTokens.map((token) => token.text).join(" ");
  const normalizedText = normalizeSemanticPhrase(phraseText);
  const properCount = phraseTokens.filter((token) =>
    hasSemanticUppercase(token.text),
  ).length;
  const technicalCount = phraseTokens.filter((token) =>
    hasTechnicalShape(token.text),
  ).length;
  const hasConnectorInside = normalizedValues
    .slice(1, -1)
    .some((value) => isSemanticConnector(value));
  const allMeaningfulCapitalized = phraseTokens
    .filter((token) => !isSemanticConnector(token.normalizedText))
    .every(isStrongProperPhraseToken);
  const nounPhrase = isNounPhrase(normalizedValues);
  const generalNounPhrase = isGeneralNounPhrase(normalizedValues);
  const actionObjectPhrase = isActionObjectPhrase({
    normalizedValues,
    segmentId: phraseTokens[0]?.segmentId,
    nextToken,
  });

  if (!actionObjectPhrase && isVerbInfinitiveSurface(first)) {
    return null;
  }

  if (
    !allMeaningfulCapitalized &&
    !nounPhrase &&
    !generalNounPhrase &&
    !actionObjectPhrase
  ) {
    return null;
  }

  if (
    hasConnectorInside &&
    !nounPhrase &&
    !generalNounPhrase &&
    !isAllowedProperConnectorPhrase()
  ) {
    return null;
  }

  if (nounPhrase && absorbsProperNameAfterConnector(phraseTokens)) {
    return null;
  }

  const source: SemanticPhraseCandidate["source"] =
    nounPhrase && properCount === 0
      ? "NOUN_PHRASE"
      : (generalNounPhrase || actionObjectPhrase) && properCount === 0
        ? "GENERAL_NOUN_PHRASE"
        : hasConnectorInside
          ? "PROPER_NOUN_PHRASE"
          : "CAPITALIZED_PHRASE";
  const score =
    source === "NOUN_PHRASE"
      ? 0.64 + Math.min(meaningfulTokens.length, 3) * 0.04
      : source === "GENERAL_NOUN_PHRASE"
        ? 0.5 + Math.min(meaningfulTokens.length, 3) * 0.04
      : 0.78 + Math.min(properCount + technicalCount, 4) * 0.04;

  return {
    text: formatSemanticPhraseLabel(phraseTokens, source),
    normalizedText,
    tokens: meaningfulTokens.map(stemSemanticToken),
    start: phraseTokens[0]?.start ?? 0,
    end: phraseTokens[phraseTokens.length - 1]?.end ?? 0,
    source,
    score: Math.min(0.96, score),
    reasons: [
      source === "NOUN_PHRASE" || source === "GENERAL_NOUN_PHRASE"
        ? "noun-phrase-pattern"
        : "capitalized-phrase",
      hasConnectorInside ? "valid-internal-connector" : "contiguous-phrase",
    ],
  };
}

function createDerivedVerbAdverbCandidates(tokens: SemanticToken[]) {
  const candidates: SemanticPhraseCandidate[] = [];

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const verb = tokens[index];
    const adverb = tokens[index + 1];

    if (!verb || !adverb) {
      continue;
    }

    if (!isWithinSingleSegment([verb, adverb])) {
      continue;
    }

    const noun = nominalizeEligibleVerb(verb);
    const adjective = adjectiveFromConceptualAdverb(adverb);

    if (!noun || !adjective) {
      continue;
    }

    const text = `${noun} ${adjective}`;
    const normalizedText = normalizeSemanticPhrase(text);
    const normalizedTerms = [
      normalizeSemanticPhrase(noun),
      normalizeSemanticPhrase(adjective),
    ];

    candidates.push({
      text,
      normalizedText,
      tokens: normalizedTerms.map(stemSemanticToken),
      start: verb.start,
      end: adverb.end,
      source: "GENERAL_NOUN_PHRASE",
      score: 0.58,
      reasons: ["noun-phrase-pattern", "derived-verb-adverb"],
    });
  }

  return candidates;
}

function suppressContainedCandidates(candidates: SemanticPhraseCandidate[]) {
  return candidates.filter((candidate) => {
    const isContainedInLargerCandidate = candidates.some((other) => {
      if (other === candidate || other.tokens.length <= candidate.tokens.length) {
        return false;
      }

      return other.start <= candidate.start && other.end >= candidate.end;
    });

    if (isContainedInLargerCandidate) {
      return false;
    }

    const candidateTerms = new Set(candidate.tokens);
    if (candidateTerms.size !== 1) {
      return true;
    }

    return !candidates.some((other) => {
      if (other === candidate || other.tokens.length < 2) {
        return false;
      }

      return other.tokens.some((token) => candidateTerms.has(token));
    });
  });
}

function isStrongProperPhraseToken(token: SemanticToken) {
  return (
    hasSemanticUppercase(token.text) ||
    hasTechnicalShape(token.text) ||
    /^\d+$/.test(token.text)
  );
}

function compareSemanticCandidates(
  first: SemanticPhraseCandidate,
  second: SemanticPhraseCandidate,
) {
  if (second.score !== first.score) {
    return second.score - first.score;
  }

  if (first.start !== second.start) {
    return first.start - second.start;
  }

  return first.text.localeCompare(second.text);
}

function upsertCandidate(
  candidates: Map<string, SemanticPhraseCandidate>,
  candidate: SemanticPhraseCandidate,
) {
  const current = candidates.get(candidate.normalizedText);

  if (!current || candidate.score > current.score) {
    candidates.set(candidate.normalizedText, candidate);
  }
}

function isNounPhrase(normalizedValues: string[]) {
  const meaningfulValues = normalizedValues.filter(
    (value) => !isSemanticConnector(value),
  );
  const [first, second] = meaningfulValues;

  if (!first || !second) {
    return false;
  }

  return (
    normalizedValues.some((value) => isSemanticConnector(value)) &&
    isFlexibleConnectorNounPhrase(normalizedValues, meaningfulValues)
  );
}

function isGeneralNounPhrase(normalizedValues: string[]) {
  const meaningfulValues = normalizedValues.filter(
    (value) => !isSemanticConnector(value),
  );
  const [first, second] = meaningfulValues;

  if (!first || !second) {
    return false;
  }

  if (
    meaningfulValues.some(
      (value) =>
        isShortBoundaryToken(value) || isLikelyInfinitive(value),
    )
  ) {
    return false;
  }

  if (isLikelyPresentVerb(first)) {
    return false;
  }

  const hasConnectorInside = normalizedValues
    .slice(1, -1)
    .some((value) => isSemanticConnector(value));

  if (hasConnectorInside) {
    return isFlexibleConnectorNounPhrase(normalizedValues, meaningfulValues);
  }

  return (
    meaningfulValues.length === 2 &&
    ((isLikelyModifier(first) && isNominalConceptTerm(second)) ||
      (isLikelyNoun(first) && (isLikelyAdjective(second) || isLikelyNoun(second))))
  );
}

function isNominalConceptTerm(value: string) {
  return value.length >= 8;
}

function isFlexibleConnectorNounPhrase(
  normalizedValues: string[],
  meaningfulValues: string[],
) {
  const connectorIndex = normalizedValues.findIndex((value) =>
    isSemanticConnector(value),
  );
  const connector = normalizedValues[connectorIndex] ?? "";
  const beforeConnector = normalizedValues.slice(0, connectorIndex);
  const afterConnector = normalizedValues.slice(connectorIndex + 1);

  if (!isNominalPhraseConnector(connector)) {
    return false;
  }

  if (
    connectorIndex <= 0 ||
    afterConnector.length !== 1 ||
    beforeConnector.length > 2 ||
    meaningfulValues.length > 3
  ) {
    return false;
  }

  if (
    meaningfulValues.some(
      (value) => isLikelyAdjective(value) || isLikelyInfinitive(value),
    )
  ) {
    return false;
  }

  return (
    meaningfulValues.some(isNominalConceptTerm) ||
    (beforeConnector.length === 2 &&
      meaningfulValues.length === 3 &&
      meaningfulValues.every(isLikelyNoun)) ||
    (beforeConnector.length === 1 &&
      meaningfulValues.length === 2 &&
      meaningfulValues.every(isLikelyNoun))
  );
}

function isLikelyNoun(value: string) {
  return /^[\p{L}]{4,}$/u.test(value);
}

function isLikelyAdjective(value: string) {
  void value;
  return false;
}

function isLikelyGerund(value: string) {
  void value;
  return false;
}

function isLikelyModifier(value: string) {
  return value.length >= 4 && !isShortStructuralToken(value);
}

function isSalientAbstractSingleNoun({
  token,
  previousToken,
  nextToken,
  index,
}: {
  token: SemanticToken;
  previousToken?: SemanticToken;
  nextToken?: SemanticToken;
  index: number;
}) {
  const normalized = token.normalizedText;
  const previous = previousToken?.normalizedText ?? "";
  const next = nextToken?.normalizedText ?? "";

  if (
    normalized.length < 6 ||
    isShortBoundaryToken(normalized) ||
    isLikelyAdjective(normalized) ||
    isLikelyGerund(normalized) ||
    isLikelyInfinitive(normalized) ||
    (!isNominalConceptTerm(normalized) && !hasStructuralSimpleNounEvidence({
      normalized,
      previous,
      next,
    }))
  ) {
    return false;
  }

  return (
    hasStructuralSimpleNounEvidence({
      normalized,
      previous,
      next,
    }) ||
    (index === 1 && isShortStructuralToken(previous)) ||
    isShortStructuralToken(previous) ||
    isShortStructuralToken(next)
  );
}

function hasStructuralSimpleNounEvidence({
  normalized,
  previous,
  next,
}: {
  normalized: string;
  previous: string;
  next: string;
}) {
  if (
    next &&
    !isShortBoundaryToken(next) &&
    (isLikelyNoun(next) || isLikelyModifier(next))
  ) {
    return false;
  }

  return (
    normalized.length >= 7 &&
    isShortStructuralToken(previous) &&
    !isLikelyInfinitive(normalized)
  );
}

function isConjugatedVerbArticleNounPhrase(normalizedValues: string[]) {
  const [first, second, third] = normalizedValues;

  return Boolean(
    first &&
      second &&
      third &&
      isLikelyPresentVerb(first) &&
      isShortStructuralToken(second) &&
      !isShortBoundaryToken(third),
  );
}

function isConjugatedVerbInfinitivePhrase(normalizedValues: string[]) {
  const meaningfulValues = normalizedValues.filter(
    (value) => !isSemanticConnector(value),
  );
  const [first, second] = meaningfulValues;

  return Boolean(
    first &&
      second &&
      isLikelyPresentVerb(first) &&
      isVerbInfinitiveSurface(second),
  );
}

function isTemporalComplementFragment(normalizedValues: string[]) {
  void normalizedValues;
  return false;
}

function startsWithSentenceInitialConnectorFragment(
  phraseTokens: SemanticToken[],
  previousToken?: SemanticToken,
) {
  const [first, second] = phraseTokens;

  return Boolean(
    first &&
      second &&
      isLikelySentenceInitialOnly(first, previousToken) &&
      isShortStructuralToken(second.normalizedText),
  );
}

function isActionObjectPhrase({
  normalizedValues,
  segmentId,
  nextToken,
}: {
  normalizedValues: string[];
  segmentId?: number;
  nextToken?: SemanticToken;
}) {
  const [first, second, third] = normalizedValues;

  if (
    nextToken &&
    nextToken.segmentId === segmentId &&
    !isShortBoundaryToken(nextToken.normalizedText) &&
    !isLikelyPresentVerb(nextToken.normalizedText) &&
    (isLikelyNoun(nextToken.normalizedText) ||
      isLikelyAdjective(nextToken.normalizedText) ||
      isLikelyModifier(nextToken.normalizedText))
  ) {
    return false;
  }

  return Boolean(
      first &&
      second &&
      third &&
      normalizedValues.length === 3 &&
      isVerbInfinitiveSurface(first) &&
      isShortStructuralToken(second) &&
      isLikelyNoun(third),
  );
}

function isLikelyPresentVerb(value: string) {
  void value;
  return false;
}

function isLikelyInfinitive(value: string) {
  return /^[\p{L}]{5,}(?:ar|er|ir|arme|erme|irme|arte|erte|irte|arse|erse|irse|arnos|ernos|irnos)$/u.test(value);
}

function isVerbInfinitiveSurface(value: string) {
  return isLikelyInfinitive(value);
}

function nominalizeEligibleVerb(token: SemanticToken) {
  void token;
  return null;
}

function adjectiveFromConceptualAdverb(token: SemanticToken) {
  void token;
  return null;
}

function capitalizeTerm(value: string) {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

function isAllowedProperConnectorPhrase() {
  return false;
}

function absorbsProperNameAfterConnector(phraseTokens: SemanticToken[]) {
  const connectorIndex = phraseTokens.findIndex((token) =>
    isSemanticConnector(token.normalizedText),
  );

  if (connectorIndex < 0) {
    return false;
  }

  return phraseTokens
    .slice(connectorIndex + 1)
    .some((token) => hasTechnicalShape(token.text));
}

function isShortBoundaryToken(value: string) {
  return isShortStructuralToken(value);
}

function isLikelySentenceInitialOnly(
  token: SemanticToken,
  previousToken?: SemanticToken,
) {
  return (
    (!previousToken || previousToken.segmentId !== token.segmentId) &&
    /^[\p{Lu}][\p{Ll}]+$/u.test(token.text)
  );
}

function formatSemanticPhraseLabel(
  phraseTokens: SemanticToken[],
  source: SemanticPhraseCandidate["source"],
) {
  const phrase = phraseTokens.map((token) => token.text).join(" ");

  if (source !== "NOUN_PHRASE" && source !== "GENERAL_NOUN_PHRASE") {
    return phrase;
  }

  return phrase.charAt(0).toLocaleUpperCase() + phrase.slice(1);
}

function stemSemanticToken(value: string) {
  return normalizeAssociationToken(value);
}

function isSemanticConnector(value: string) {
  return isShortStructuralToken(value);
}

function isNominalPhraseConnector(value: string) {
  return value === "de" || value === "del";
}

function isWithinSingleSegment(tokens: SemanticToken[]) {
  const [first] = tokens;

  if (!first) {
    return true;
  }

  return tokens.every((token) => token.segmentId === first.segmentId);
}
