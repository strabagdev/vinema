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
    | "GENERAL_NOUN_PHRASE"
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
  "dificultar",
  "hacer",
  "necesita",
  "necesitamos",
  "necesito",
  "preparar",
  "puede",
  "pueden",
  "quiero",
  "realizara",
  "realizar",
  "revisan",
  "revisar",
  "tener",
  "usar",
]);

const GENERIC_TERMS = new Set([
  "actual",
  "cosas",
  "despues",
  "general",
  "mediante",
  "mayor",
  "menor",
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

const GENERIC_MANNER_ADVERBS = new Set([
  "adecuadamente",
  "correctamente",
  "directamente",
  "facilmente",
  "generalmente",
  "normalmente",
  "nuevamente",
  "rapidamente",
  "simplemente",
]);

const STRUCTURAL_SINGLE_NOUN_PRECEDERS = new Set([
  "el",
  "la",
  "los",
  "las",
]);

const STRUCTURAL_SINGLE_NOUN_FOLLOWERS = new Set([
  "ante",
  "con",
  "contra",
  "durante",
  "en",
  "hacia",
  "mediante",
  "para",
  "por",
  "sin",
  "sobre",
  "tras",
]);

const MAX_SEMANTIC_SUGGESTIONS = 5;

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
      const candidate = createPhraseCandidate(phraseTokens);
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
  const visibleLabel = KNOWN_VISIBLE_LABELS.get(normalized);
  const nounLabel = KNOWN_NOUN_LABELS.get(normalized);
  const isTechnical = hasTechnicalShape(token.text);
  const isProper =
    token.start > 0 &&
    hasSemanticUppercase(token.text) &&
    !isLikelySentenceInitialOnly(token);

  const isSalientSingleNoun = isSalientAbstractSingleNoun({
    token,
    previousToken,
    nextToken,
    index,
  });

  if (!visibleLabel && !nounLabel && !isTechnical && !isProper && !isSalientSingleNoun) {
    return null;
  }

  if (isSemanticStopword(normalized) || isGenericTerm(normalized)) {
    return null;
  }

  const text =
    visibleLabel ??
    nounLabel ??
    (isSalientSingleNoun ? capitalizeTerm(token.text.toLocaleLowerCase("es")) : preserveVisibleToken(token.text));

  return {
    text,
    normalizedText: normalizeSemanticPhrase(text),
    tokens: [stemSemanticToken(normalized)],
    start: token.start,
    end: token.end,
    source:
      visibleLabel || nounLabel || isTechnical
        ? "KNOWN_TERM"
        : isSalientSingleNoun
          ? "GENERAL_NOUN_PHRASE"
          : "CAPITALIZED_PHRASE",
    score: visibleLabel || nounLabel ? 0.76 : isTechnical ? 0.7 : isSalientSingleNoun ? 0.58 : 0.5,
    reasons: [
      visibleLabel || nounLabel
        ? "known-term"
        : isTechnical
          ? "technical-shape"
          : isSalientSingleNoun
            ? "salient-abstract-noun"
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

  if (isConjugatedVerbArticleNounPhrase(normalizedValues)) {
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
  const generalNounPhrase = isGeneralNounPhrase(normalizedValues);

  if (!allMeaningfulCapitalized && !nounPhrase && !generalNounPhrase) {
    return null;
  }

  if (
    hasConnectorInside &&
    !nounPhrase &&
    !generalNounPhrase &&
    !isAllowedProperConnectorPhrase(normalizedValues)
  ) {
    return null;
  }

  if (nounPhrase && absorbsProperNameAfterConnector(phraseTokens)) {
    return null;
  }

  const source: SemanticPhraseCandidate["source"] =
    nounPhrase && properCount === 0
      ? "NOUN_PHRASE"
      : generalNounPhrase && properCount === 0
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

function isGeneralNounPhrase(normalizedValues: string[]) {
  const meaningfulValues = normalizedValues.filter(
    (value) => !SEMANTIC_CONNECTORS.has(value),
  );
  const [first, second] = meaningfulValues;

  if (!first || !second) {
    return false;
  }

  if (
    meaningfulValues.some(
      (value) =>
        isSemanticStopword(value) || isGenericTerm(value) || GENERIC_VERBS.has(value),
    )
  ) {
    return false;
  }

  const hasConnectorInside = normalizedValues
    .slice(1, -1)
    .some((value) => SEMANTIC_CONNECTORS.has(value));

  if (hasConnectorInside) {
    return isFlexibleConnectorNounPhrase(normalizedValues, meaningfulValues);
  }

  return (
    meaningfulValues.length === 2 &&
    ((isLikelyModifier(first) && isNominalConceptTerm(second)) ||
      (isLikelyNoun(first) && isLikelyAdjective(second)))
  );
}

function isNominalConceptTerm(value: string) {
  return /(cion|sion|miento|mento|dad|aje|ncia|encia|ancia|ura)$/u.test(value);
}

function isFlexibleConnectorNounPhrase(
  normalizedValues: string[],
  meaningfulValues: string[],
) {
  const connectorIndex = normalizedValues.findIndex((value) =>
    SEMANTIC_CONNECTORS.has(value),
  );
  const beforeConnector = normalizedValues.slice(0, connectorIndex);
  const afterConnector = normalizedValues.slice(connectorIndex + 1);
  const hasArticleAfterConnector = afterConnector.some((value) =>
    ["la", "las", "los"].includes(value),
  );

  if (
    connectorIndex <= 0 ||
    afterConnector.length === 0 ||
    beforeConnector.length > 1 ||
    meaningfulValues.length > 3
  ) {
    return false;
  }

  if (meaningfulValues.some(isLikelyAdjective)) {
    return false;
  }

  return (
    meaningfulValues.some(isNominalConceptTerm) ||
    (meaningfulValues.length === 2 &&
      meaningfulValues.every(isLikelyNoun) &&
      !hasArticleAfterConnector)
  );
}

function isLikelyNoun(value: string) {
  return /^[a-zñ]{4,}$/u.test(value) &&
    !isLikelyAdjective(value) &&
    !isLikelyGerund(value);
}

function isLikelyAdjective(value: string) {
  return /(al|ales|ar|ares|ble|bles|ico|ica|icos|icas|ivo|iva|ivos|ivas|il|iles|oso|osa|osos|osas|ado|ada|ados|adas|ido|ida|idos|idas)$/u.test(value);
}

function isLikelyGerund(value: string) {
  return /(ando|iendo)$/u.test(value);
}

function isLikelyModifier(value: string) {
  return /[aeiou]$/u.test(value) && !isGenericTerm(value);
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
    isSemanticStopword(normalized) ||
    isGenericTerm(normalized) ||
    isLikelyAdjective(normalized) ||
    isLikelyGerund(normalized) ||
    !isNominalConceptTerm(normalized)
  ) {
    return false;
  }

  return (
    (index === 1 && STRUCTURAL_SINGLE_NOUN_PRECEDERS.has(previous)) ||
    STRUCTURAL_SINGLE_NOUN_FOLLOWERS.has(previous) ||
    STRUCTURAL_SINGLE_NOUN_FOLLOWERS.has(next)
  );
}

function isConjugatedVerbArticleNounPhrase(normalizedValues: string[]) {
  const [first, second, third] = normalizedValues;

  return Boolean(
    first &&
      second &&
      third &&
      isLikelyPresentVerb(first) &&
      ["el", "la", "los", "las"].includes(second) &&
      !isSemanticStopword(third),
  );
}

function isLikelyPresentVerb(value: string) {
  return /^[a-zñ]{5,}(a|e|an|en)$/u.test(value) &&
    !isNominalConceptTerm(value) &&
    !isLikelyAdjective(value) &&
    !isLikelyGerund(value);
}

function nominalizeEligibleVerb(token: SemanticToken) {
  const normalized = token.normalizedText;

  if (
    isGenericTerm(normalized) ||
    isSemanticStopword(normalized) ||
    !/^[a-zñ]+r$/u.test(normalized)
  ) {
    return null;
  }

  const visible = token.text.toLocaleLowerCase("es");

  if (normalized.endsWith("ctar")) {
    return capitalizeTerm(`${visible.slice(0, -3)}ción`);
  }

  if (normalized.endsWith("ficar")) {
    return capitalizeTerm(`${visible.slice(0, -2)}ación`);
  }

  if (normalized.endsWith("izar")) {
    return capitalizeTerm(`${visible.slice(0, -2)}ación`);
  }

  if (normalized.endsWith("uar")) {
    return capitalizeTerm(`${visible.slice(0, -2)}ación`);
  }

  return null;
}

function adjectiveFromConceptualAdverb(token: SemanticToken) {
  const normalized = token.normalizedText;

  if (
    !normalized.endsWith("mente") ||
    GENERIC_MANNER_ADVERBS.has(normalized) ||
    isGenericTerm(normalized)
  ) {
    return null;
  }

  const visible = token.text.toLocaleLowerCase("es");
  const adjective = visible.slice(0, -5);

  if (adjective.length < 4 || isGenericTerm(normalizeSemanticPhrase(adjective))) {
    return null;
  }

  return adjective;
}

function capitalizeTerm(value: string) {
  return value.charAt(0).toLocaleUpperCase("es") + value.slice(1);
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

  if (source !== "NOUN_PHRASE" && source !== "GENERAL_NOUN_PHRASE") {
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
