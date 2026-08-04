import { stemSpanishToken } from "@/features/associations/normalize-text";
import { SPANISH_STOPWORDS } from "@/features/associations/spanish-stopwords";
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
    | "HISTORICAL_EVIDENCE";
  score: number;
  reasons: string[];
};

export const SEMANTIC_CONNECTORS = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
]);

export const SEMANTIC_STOPWORDS = new Set([
  "hacer",
  "tener",
  ...SPANISH_STOPWORDS,
]);

const GENERIC_VERBS = new Set([
  "comprar",
  "comparar",
  "consolidar",
  "debe",
  "hacer",
  "necesita",
  "necesitamos",
  "necesito",
  "preparar",
  "quiero",
  "realizara",
  "realizar",
  "revisar",
  "tener",
  "usar",
]);

const GENERIC_TERMS = new Set([
  "actual",
  "cosas",
  "despues",
  "general",
  "nuevo",
  "nueva",
  "pendiente",
  "varios",
]);

const KNOWN_VISIBLE_LABELS = new Map([
  ["mitcom", "Mitcom"],
  ["next js", "Next.js"],
  ["postgresql", "PostgreSQL"],
  ["railway", "Railway"],
  ["vinema", "Vinema"],
]);

const KNOWN_NOUN_LABELS = new Map([
  ["perfumes", "Perfumes"],
  ["perfume", "Perfumes"],
  ["reunion", "Reunión"],
  ["reuniones", "Reuniones"],
]);

const NOUN_PHRASE_HEADS = new Set([
  "access",
  "base",
  "control",
  "gestion",
  "informe",
  "motor",
  "operational",
  "sincronizacion",
  "tracking",
]);

const NOUN_PHRASE_MODIFIERS = new Set([
  "automatica",
  "automatico",
  "conceptos",
  "conocimiento",
  "contractual",
  "contratos",
  "core",
  "documental",
  "personal",
  "seguridad",
  "tracking",
]);

const CONNECTOR_PROPER_PHRASE_HEADS = new Set([
  "banco",
  "universidad",
]);

const MAX_SEMANTIC_SUGGESTIONS = 5;

export function extractSemanticPhraseCandidates(text: string) {
  const tokens = tokenizeSemanticText(text);
  const candidates = new Map<string, SemanticPhraseCandidate>();

  for (const token of tokens) {
    const candidate = createSingleTokenCandidate(token);
    if (candidate) {
      upsertCandidate(candidates, candidate);
    }
  }

  for (const size of [2, 3, 4]) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const phraseTokens = tokens.slice(index, index + size);
      const candidate = createPhraseCandidate(phraseTokens);
      if (candidate) {
        upsertCandidate(candidates, candidate);
      }
    }
  }

  return suppressContainedCandidates(Array.from(candidates.values()))
    .sort(compareSemanticCandidates)
    .slice(0, MAX_SEMANTIC_SUGGESTIONS);
}

function createSingleTokenCandidate(
  token: SemanticToken,
): SemanticPhraseCandidate | null {
  const normalized = normalizeSemanticPhrase(token.text);
  const visibleLabel = KNOWN_VISIBLE_LABELS.get(normalized);
  const nounLabel = KNOWN_NOUN_LABELS.get(normalized);
  const isTechnical = hasTechnicalShape(token.text);
  const isProper =
    token.start > 0 &&
    hasSemanticUppercase(token.text) &&
    !isLikelySentenceInitialOnly(token);

  if (!visibleLabel && !nounLabel && !isTechnical && !isProper) {
    return null;
  }

  if (isSemanticStopword(normalized) || isGenericTerm(normalized)) {
    return null;
  }

  const text = visibleLabel ?? nounLabel ?? preserveVisibleToken(token.text);

  return {
    text,
    normalizedText: normalizeSemanticPhrase(text),
    tokens: [stemSemanticToken(normalized)],
    start: token.start,
    end: token.end,
    source: visibleLabel || nounLabel || isTechnical ? "KNOWN_TERM" : "CAPITALIZED_PHRASE",
    score: visibleLabel || nounLabel ? 0.76 : isTechnical ? 0.7 : 0.5,
    reasons: [
      visibleLabel || nounLabel
        ? "known-term"
        : isTechnical
          ? "technical-shape"
          : "capitalized-single-token",
    ],
  };
}

function createPhraseCandidate(
  phraseTokens: SemanticToken[],
): SemanticPhraseCandidate | null {
  const normalizedValues = phraseTokens.map((token) => token.normalizedText);
  const first = normalizedValues[0] ?? "";
  const last = normalizedValues[normalizedValues.length - 1] ?? "";

  const startsWithArticleProperName =
    ["el", "la", "los", "las"].includes(first) &&
    Boolean(phraseTokens[1]?.text) &&
    hasSemanticUppercase(phraseTokens[1]?.text ?? "");

  if (
    (!startsWithArticleProperName && isSemanticStopword(first)) ||
    isSemanticStopword(last) ||
    isGenericTerm(first) ||
    isGenericTerm(last)
  ) {
    return null;
  }

  if (normalizedValues.some((value) => GENERIC_VERBS.has(value))) {
    return null;
  }

  const meaningfulTokens = normalizedValues.filter(
    (value) => !SEMANTIC_CONNECTORS.has(value),
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
    .some((value) => SEMANTIC_CONNECTORS.has(value));
  const allMeaningfulCapitalized = phraseTokens
    .filter((token) => !SEMANTIC_CONNECTORS.has(token.normalizedText))
    .every(isStrongProperPhraseToken);
  const nounPhrase = isNounPhrase(normalizedValues);

  if (!allMeaningfulCapitalized && !nounPhrase) {
    return null;
  }

  if (
    hasConnectorInside &&
    !nounPhrase &&
    !isAllowedProperConnectorPhrase(normalizedValues)
  ) {
    return null;
  }

  if (nounPhrase && absorbsProperNameAfterConnector(phraseTokens)) {
    return null;
  }

  const source: SemanticPhraseCandidate["source"] = nounPhrase && properCount === 0
    ? "NOUN_PHRASE"
    : hasConnectorInside
      ? "PROPER_NOUN_PHRASE"
      : "CAPITALIZED_PHRASE";
  const score =
    source === "NOUN_PHRASE"
      ? 0.64 + Math.min(meaningfulTokens.length, 3) * 0.04
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
      source === "NOUN_PHRASE" ? "noun-phrase-pattern" : "capitalized-phrase",
      hasConnectorInside ? "valid-internal-connector" : "contiguous-phrase",
    ],
  };
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

  return first.text.localeCompare(second.text, "es");
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
    (value) => !SEMANTIC_CONNECTORS.has(value),
  );
  const [first, second] = meaningfulValues;

  if (!first || !second) {
    return false;
  }

  if (!NOUN_PHRASE_HEADS.has(first)) {
    return false;
  }

  return (
    NOUN_PHRASE_MODIFIERS.has(second) ||
    normalizedValues.some((value) => SEMANTIC_CONNECTORS.has(value))
  );
}

function isAllowedProperConnectorPhrase(normalizedValues: string[]) {
  const connectorIndex = normalizedValues.findIndex((value) =>
    SEMANTIC_CONNECTORS.has(value),
  );

  return (
    normalizedValues.length === 3 &&
    connectorIndex === 1 &&
    CONNECTOR_PROPER_PHRASE_HEADS.has(normalizedValues[0] ?? "")
  );
}

function absorbsProperNameAfterConnector(phraseTokens: SemanticToken[]) {
  const connectorIndex = phraseTokens.findIndex((token) =>
    SEMANTIC_CONNECTORS.has(token.normalizedText),
  );

  if (connectorIndex < 0) {
    return false;
  }

  return phraseTokens
    .slice(connectorIndex + 1)
    .some((token) => KNOWN_VISIBLE_LABELS.has(token.normalizedText));
}

function isSemanticStopword(value: string) {
  return SEMANTIC_STOPWORDS.has(value);
}

function isGenericTerm(value: string) {
  return GENERIC_TERMS.has(value) || GENERIC_VERBS.has(value);
}

function isLikelySentenceInitialOnly(token: SemanticToken) {
  return token.start === 0 && /^[\p{Lu}][\p{Ll}]+$/u.test(token.text);
}

function formatSemanticPhraseLabel(
  phraseTokens: SemanticToken[],
  source: SemanticPhraseCandidate["source"],
) {
  const phrase = phraseTokens.map((token) => token.text).join(" ");

  if (source !== "NOUN_PHRASE") {
    return phrase;
  }

  return phrase.charAt(0).toLocaleUpperCase("es") + phrase.slice(1);
}

function preserveVisibleToken(value: string) {
  if (KNOWN_VISIBLE_LABELS.has(normalizeSemanticPhrase(value))) {
    return KNOWN_VISIBLE_LABELS.get(normalizeSemanticPhrase(value)) ?? value;
  }

  return value;
}

function stemSemanticToken(value: string) {
  return stemSpanishToken(value);
}
