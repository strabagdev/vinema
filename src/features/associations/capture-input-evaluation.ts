import type { Context } from "@/domain/context/context";
import type { Node } from "@/domain/node/node";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import {
  buildAssociationIndex,
  suggestAssociations,
  type AssociationIndex,
} from "@/features/associations/association-engine";
import {
  buildConceptSuggestionsFromTraces,
  diagnoseConceptSuggestionDetails,
} from "@/features/associations/concept-suggestions";
import { deriveKnowledgeSuggestions } from "@/features/cognition/knowledge-suggestions";
import { normalizeAssociationText } from "@/features/associations/normalize-text";
import { hasDirectionalContradiction } from "@/features/associations/local-support";
import {
  tokenizeAssociationText,
  uniqueTokens,
} from "@/features/associations/tokenize";
import { SPANISH_STOPWORDS } from "@/features/associations/spanish-stopwords";
import { resolveConceptIdentity } from "@/features/concepts/concept-identity";
import { extractSemanticPhraseCandidates } from "@/features/semantics/semantic-phrase-extractor";
import type {
  AssociationSuggestion,
  ConceptSuggestion,
  EmergingConceptSuggestion,
  SuggestionDiagnostics,
} from "@/features/associations/association-types";

export const EMERGING_EVIDENCE_LIMIT = 12;
export const MIN_EMERGING_EVIDENCE_CAPTURES = 3;
export const MIN_EMERGING_TERM_FREQUENCY = 2;
export const MIN_EMERGING_SCORE = 0.36;
export const MIN_EVIDENCE_CAPTURE_SCORE = 0.05;

const GENERIC_CONCEPT_TERMS = new Set([
  "abrir",
  "actualiz",
  "aparec",
  "captur",
  "confirm",
  "cos",
  "crear",
  "despues",
  "escribir",
  "general",
  "idea",
  "important",
  "necesit",
  "necesito",
  "nueva",
  "nuevo",
  "nota",
  "pendient",
  "prepar",
  "revis",
  "revisar",
  "tema",
  "trabaj",
  "vario",
]);

const DISPLAY_LABELS: Record<string, string> = {
  reunion: "Reuniones",
  reun: "Reuniones",
  perfum: "Perfumes",
  perfume: "Perfumes",
  mitcom: "Mitcom",
  railway: "Railway",
  sponsor: "Sponsor Meeting",
};

const MIN_INPUT_EMERGING_TOKENS = 1;
const MIN_INPUT_EMERGING_SCORE = 0.42;
const INPUT_EMERGING_LIMIT = 5;

type ExpressionCandidate = {
  key: string;
  displayLabel: string;
  frequency: number;
  wordCount: number;
  meaningfulTerms: string[];
  representativeOverlap: number;
  queryOverlap: number;
  hasProperCase: boolean;
};

export type CaptureInputEvaluation = {
  recoveryMatches: AssociationSuggestion[];
  conceptSuggestions: ConceptSuggestion[];
  diagnostics: SuggestionDiagnostics;
};

export function evaluateCaptureInput({
  text,
  nodes,
  contexts,
  relations,
  currentNodeId,
  selectedCaptureIds = [],
  selectedContextIds = [],
  requestId = 0,
  debounceMs = 0,
  timings = {},
}: {
  text: string;
  nodes: Node[];
  contexts: Context[];
  relations: NodeContextRelation[];
  currentNodeId?: string;
  selectedCaptureIds?: string[];
  selectedContextIds?: string[];
  requestId?: number;
  debounceMs?: number;
  timings?: Partial<
    Pick<
      SuggestionDiagnostics,
      "captureReadMs" | "contextReadMs" | "relationReadMs"
    >
  >;
}): CaptureInputEvaluation {
  const startedAt = performance.now();
  const indexStartedAt = performance.now();
  const index = buildAssociationIndex({ nodes, relations });
  const indexPreparationMs = Math.round(performance.now() - indexStartedAt);
  const recoveryStartedAt = performance.now();
  const recoveryDiagnostics = {
    queryIndexMs: 0,
    scoringMs: 0,
    rankingMs: 0,
    resultBuildMs: 0,
    scoredCaptureCount: 0,
  };
  const recoveryMatches = suggestAssociations(index, {
    text,
    currentNodeId,
    selectedCaptureIds,
    limit: EMERGING_EVIDENCE_LIMIT,
    diagnostics: recoveryDiagnostics,
  });
  const recoveryMs = Math.round(performance.now() - recoveryStartedAt);
  const conceptsStartedAt = performance.now();
  const conceptDiagnosis = diagnoseConceptSuggestionDetails({
    text,
    contexts,
    nodes,
    relations,
    selectedContextIds,
  });
  const conceptTraces = conceptDiagnosis.traces;
  const existingConcepts = buildConceptSuggestionsFromTraces({
    contexts,
    selectedContextIds,
    traces: conceptTraces,
  });
  const knowledgeSuggestions = deriveKnowledgeSuggestions({
    inputConceptIds: getPresentConceptIds({
      conceptTraces,
      selectedContextIds,
    }),
    contexts,
    nodes,
    relations,
    localText: text,
    localConceptTraces: conceptTraces,
  });
  const knowledgeConcepts = knowledgeSuggestions
    .filter((suggestion) => suggestion.confidence !== "LOW")
    .map((suggestion): Extract<ConceptSuggestion, { kind: "existing" }> | null => {
      const context = contexts.find((item) => item.id === suggestion.conceptId);

      if (!context) {
        return null;
      }

      return {
        kind: "existing",
        context,
        conceptId: suggestion.conceptId,
        label: suggestion.canonicalLabel,
        score: suggestion.confidence === "HIGH" ? 1 : 0.7,
        evidenceCaptureIds: suggestion.evidenceNodeIds,
        matchedTerms: [],
        knowledgeSuggestionKind: suggestion.kind,
        knowledgeSuggestionReasons: suggestion.reasons,
      };
    })
    .filter(
      (suggestion): suggestion is Extract<ConceptSuggestion, { kind: "existing" }> =>
        suggestion !== null,
    );
  const directConcepts = existingConcepts
    .filter(
      (suggestion): suggestion is Extract<ConceptSuggestion, { kind: "existing" }> =>
        suggestion.kind === "existing",
    )
    .map((suggestion) => ({
      ...suggestion,
      knowledgeSuggestionKind: suggestion.knowledgeSuggestionKind ?? "RELATED_NOW",
      knowledgeSuggestionReasons: suggestion.knowledgeSuggestionReasons ?? [
        suggestion.matchedAlias
          ? "Alias detectado en el texto"
          : "Concepto detectado en el texto",
      ],
    }));
  const selectedConcepts = directConcepts.filter((suggestion) =>
    selectedContextIds.includes(suggestion.conceptId),
  );
  const clusterStartedAt = performance.now();
  const emergingConcepts = detectEmergingConcepts({
    text,
    recoveryMatches,
    existingConcepts,
    index,
  });
  const clusterDetectionMs = Math.round(performance.now() - clusterStartedAt);
  const deduplicationStartedAt = performance.now();
  const conceptSuggestions = dedupeConceptSuggestions([
    ...directConcepts,
    ...selectedConcepts,
    ...knowledgeConcepts,
    ...emergingConcepts,
  ]);
  const deduplicationMs = Math.round(performance.now() - deduplicationStartedAt);
  const conceptsMs = Math.round(performance.now() - conceptsStartedAt);

  return {
    recoveryMatches,
    conceptSuggestions,
    diagnostics: {
      query: text,
      requestId,
      debounceMs,
      captureReadMs: timings.captureReadMs ?? 0,
      contextReadMs: timings.contextReadMs ?? 0,
      relationReadMs: timings.relationReadMs ?? 0,
      indexPreparationMs,
      recoveryMs,
      conceptsMs,
      stateUpdateMs: 0,
      totalMs: Math.round(performance.now() - startedAt),
      captureCount: index.captures.length,
      contextCount: contexts.length,
      relationCount: relations.length,
      recoveryResultCount: recoveryMatches.length,
      conceptResultCount: conceptSuggestions.length,
      conceptTraces,
      evidenceCandidateCount: recoveryMatches.length,
      clusterCount: emergingConcepts.length,
      existingConceptSuggestionCount: existingConcepts.length,
      emergingConceptSuggestionCount: emergingConcepts.length,
      clusterDetectionMs,
      labelExtractionMs: 0,
      deduplicationMs,
      conceptDiagnosticRunCount: conceptDiagnosis.metrics.diagnosticRunCount,
      identityCandidateInitialCount:
        conceptDiagnosis.metrics.identityCandidateInitialCount,
      identityCandidateDeduplicatedCount:
        conceptDiagnosis.metrics.identityCandidateDeduplicatedCount,
      identityContextTraversalCount:
        conceptDiagnosis.metrics.identityContextTraversalCount,
      recoveryQueryIndexMs: recoveryDiagnostics.queryIndexMs,
      recoveryScoringMs: recoveryDiagnostics.scoringMs,
      recoveryRankingMs: recoveryDiagnostics.rankingMs,
      recoveryResultBuildMs: recoveryDiagnostics.resultBuildMs,
      recoveryScoredCaptureCount: recoveryDiagnostics.scoredCaptureCount,
    },
  };
}

function detectEmergingConcepts({
  text,
  recoveryMatches,
  existingConcepts,
}: {
  text: string;
  recoveryMatches: AssociationSuggestion[];
  existingConcepts: ConceptSuggestion[];
  index: AssociationIndex;
}): EmergingConceptSuggestion[] {
  const inputConcepts = detectInputEmergingConcepts({
    text,
    existingConcepts,
  });
  const evidence = recoveryMatches
    .filter((match) => match.score >= MIN_EVIDENCE_CAPTURE_SCORE)
    .slice(0, EMERGING_EVIDENCE_LIMIT);

  if (evidence.length < MIN_EMERGING_EVIDENCE_CAPTURES) {
    return inputConcepts;
  }

  const queryTokens = uniqueTokens(tokenizeAssociationText(text));
  const evidenceTokens = evidence.map((match) =>
    uniqueTokens(tokenizeAssociationText(match.node.content)),
  );
  const frequencies = new Map<string, number>();

  for (const tokens of evidenceTokens) {
    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
  }

  const representativeTerms = Array.from(frequencies.entries())
    .filter(([, frequency]) => frequency >= MIN_EMERGING_TERM_FREQUENCY)
    .filter(([term]) => !GENERIC_CONCEPT_TERMS.has(term))
    .sort((first, second) => {
      const labelBoost =
        Number(Boolean(DISPLAY_LABELS[second[0]])) -
        Number(Boolean(DISPLAY_LABELS[first[0]]));
      const queryBoost =
        Number(queryTokens.includes(second[0])) - Number(queryTokens.includes(first[0]));
      return (
        labelBoost ||
        queryBoost ||
        second[1] - first[1] ||
        first[0].localeCompare(second[0])
      );
    })
    .map(([term]) => term)
    .slice(0, 4);

  if (representativeTerms.length === 0) {
    return [];
  }

  const label = createSuggestedLabel({
    representativeTerms,
    evidenceTexts: evidence.map((match) => match.node.content),
    queryText: text,
  });

  if (!label || hasEquivalentExistingConcept(label, existingConcepts)) {
    return inputConcepts;
  }

  const cohesion =
    representativeTerms.reduce(
      (sum, term) => sum + (frequencies.get(term) ?? 0) / evidence.length,
      0,
    ) / representativeTerms.length;
  const score = Math.min(1, cohesion * 0.7 + Math.min(evidence.length / 5, 1) * 0.3);

  if (score < MIN_EMERGING_SCORE) {
    return inputConcepts;
  }

  const evidenceCaptureIds = evidence.map((match) => match.node.id);

  return dedupeEmergingConcepts([
    {
      kind: "emerging",
      candidateId: createCandidateId(label, evidenceCaptureIds, representativeTerms),
      suggestedLabel: label,
      score,
      evidenceCaptureIds,
      representativeTerms,
    },
    ...inputConcepts,
  ]);
}

function detectInputEmergingConcepts({
  text,
  existingConcepts,
}: {
  text: string;
  existingConcepts: ConceptSuggestion[];
}): EmergingConceptSuggestion[] {
  const tokens = uniqueTokens(tokenizeAssociationText(text));

  if (tokens.length < MIN_INPUT_EMERGING_TOKENS) {
    return [];
  }

  const candidates = collectInputConceptCandidates(text);

  return dedupeEmergingConcepts(
    candidates
      .filter((candidate) => !hasEquivalentExistingConcept(candidate.label, existingConcepts))
      .map((candidate) => ({
        kind: "emerging" as const,
        candidateId: createCandidateId(candidate.label, [], candidate.terms),
        suggestedLabel: candidate.label,
        score: candidate.score,
        evidenceCaptureIds: [],
        representativeTerms: candidate.terms,
      }))
      .filter((candidate) => candidate.score >= MIN_INPUT_EMERGING_SCORE),
  ).slice(0, INPUT_EMERGING_LIMIT);
}

function collectInputConceptCandidates(text: string) {
  return extractSemanticPhraseCandidates(text).map((candidate) => ({
    label: candidate.text,
    terms: candidate.tokens,
    score: candidate.score,
  })).sort((first, second) => {
    if (second.score !== first.score) {
      return second.score - first.score;
    }

    return first.label.localeCompare(second.label);
  });
}

function dedupeEmergingConcepts(suggestions: EmergingConceptSuggestion[]) {
  const byLabel = new Map<string, EmergingConceptSuggestion>();

  for (const suggestion of suggestions) {
    const key = normalizeLabelForDeduplication(suggestion.suggestedLabel);
    const current = byLabel.get(key);

    if (!current || suggestion.score > current.score) {
      byLabel.set(key, suggestion);
    }
  }

  return Array.from(byLabel.values()).sort((first, second) => {
    if (second.evidenceCaptureIds.length !== first.evidenceCaptureIds.length) {
      return second.evidenceCaptureIds.length - first.evidenceCaptureIds.length;
    }

    if (second.score !== first.score) {
      return second.score - first.score;
    }

    return first.suggestedLabel.localeCompare(second.suggestedLabel);
  });
}

function createSuggestedLabel({
  representativeTerms,
  evidenceTexts,
  queryText,
}: {
  representativeTerms: string[];
  evidenceTexts: string[];
  queryText: string;
}) {
  const expression = findBestExpressionLabel({
    evidenceTexts,
    queryText,
    representativeTerms,
  });

  if (expression) {
    return expression;
  }

  const [primary, secondary] = representativeTerms;

  if (!primary) {
    return null;
  }

  if (DISPLAY_LABELS[primary]) {
    return DISPLAY_LABELS[primary];
  }

  const labelTerms = secondary ? [primary, secondary] : [primary];
  return labelTerms.map(capitalizeTerm).join(" ");
}

function findBestExpressionLabel({
  evidenceTexts,
  queryText,
  representativeTerms,
}: {
  evidenceTexts: string[];
  queryText: string;
  representativeTerms: string[];
}) {
  const candidates = collectExpressionCandidates({
    evidenceTexts,
    queryText,
    representativeTerms,
  });

  return candidates[0]?.displayLabel ?? null;
}

function collectExpressionCandidates({
  evidenceTexts,
  queryText,
  representativeTerms,
}: {
  evidenceTexts: string[];
  queryText: string;
  representativeTerms: string[];
}) {
  const representativeSet = new Set(representativeTerms);
  const queryTerms = new Set(tokenizeAssociationText(queryText));
  const candidates = new Map<string, ExpressionCandidate>();

  for (const text of evidenceTexts) {
    const seenInCapture = new Set<string>();
    const words = extractWords(text);

    for (const wordCount of [2, 3]) {
      for (let index = 0; index <= words.length - wordCount; index += 1) {
        const phraseWords = words.slice(index, index + wordCount);
        const candidate = createExpressionCandidate({
          phraseWords,
          representativeSet,
          queryTerms,
        });

        if (!candidate || seenInCapture.has(candidate.key)) {
          continue;
        }

        seenInCapture.add(candidate.key);
        const current = candidates.get(candidate.key);

        if (current) {
          current.frequency += 1;
          current.representativeOverlap = Math.max(
            current.representativeOverlap,
            candidate.representativeOverlap,
          );
          current.queryOverlap = Math.max(current.queryOverlap, candidate.queryOverlap);
          current.hasProperCase = current.hasProperCase || candidate.hasProperCase;
        } else {
          candidates.set(candidate.key, candidate);
        }
      }
    }
  }

  return Array.from(candidates.values())
    .filter((candidate) => candidate.frequency >= MIN_EMERGING_TERM_FREQUENCY)
    .filter((candidate) => candidate.representativeOverlap > 0)
    .filter(
      (candidate) =>
        !hasDirectionalContradiction(queryText, candidate.displayLabel),
    )
    .filter(
      (candidate) =>
        candidate.hasProperCase ||
        candidate.meaningfulTerms.every((term) => !DISPLAY_LABELS[term]),
    )
    .sort(compareExpressionCandidates);
}

function createExpressionCandidate({
  phraseWords,
  representativeSet,
  queryTerms,
}: {
  phraseWords: string[];
  representativeSet: Set<string>;
  queryTerms: Set<string>;
}): ExpressionCandidate | null {
  const normalizedWords = phraseWords.map((word) => normalizeAssociationText(word));
  const startsWithStopword = SPANISH_STOPWORDS.has(normalizedWords[0] ?? "");
  const endsWithStopword = SPANISH_STOPWORDS.has(
    normalizedWords[normalizedWords.length - 1] ?? "",
  );

  if (startsWithStopword || endsWithStopword) {
    return null;
  }

  const normalizedPhrase = normalizeAssociationText(phraseWords.join(" "));
  const meaningfulTerms = uniqueTokens(tokenizeAssociationText(normalizedPhrase));

  if (
    meaningfulTerms.length < 2 ||
    meaningfulTerms.every((term) => GENERIC_CONCEPT_TERMS.has(term))
  ) {
    return null;
  }

  const representativeOverlap = meaningfulTerms.filter((term) =>
    representativeSet.has(term),
  ).length;
  const queryOverlap = meaningfulTerms.filter((term) => queryTerms.has(term)).length;

  return {
    key: normalizedPhrase,
    displayLabel: formatExpressionLabel(phraseWords),
    frequency: 1,
    wordCount: phraseWords.length,
    meaningfulTerms,
    representativeOverlap,
    queryOverlap,
    hasProperCase: hasExpressionCapitalization(phraseWords),
  };
}

function compareExpressionCandidates(
  first: ExpressionCandidate,
  second: ExpressionCandidate,
) {
  return (
    Number(second.hasProperCase) - Number(first.hasProperCase) ||
    second.frequency - first.frequency ||
    second.representativeOverlap - first.representativeOverlap ||
    second.queryOverlap - first.queryOverlap ||
    first.wordCount - second.wordCount ||
    first.displayLabel.localeCompare(second.displayLabel)
  );
}

function extractWords(text: string) {
  return Array.from(text.matchAll(/[\p{L}\p{N}]+/gu), (match) => match[0]);
}

function formatExpressionLabel(words: string[]) {
  const phrase = words.join(" ").replace(/\s+/g, " ").trim();

  if (words.some(hasUppercaseLetter)) {
    return phrase;
  }

  return capitalizeTerm(phrase);
}

function hasUppercaseLetter(value: string) {
  return value !== value.toLocaleLowerCase("es");
}

function hasExpressionCapitalization(words: string[]) {
  return words.filter(hasUppercaseLetter).length >= Math.min(2, words.length);
}

function capitalizeTerm(term: string) {
  return term.charAt(0).toUpperCase() + term.slice(1);
}

function createCandidateId(
  label: string,
  evidenceCaptureIds: string[],
  terms: string[],
) {
  return `emerging:${normalizeLabel(label)}:${stableHash([
    ...evidenceCaptureIds.sort(),
    ...terms.sort(),
  ].join("|"))}`;
}

function dedupeConceptSuggestions(suggestions: ConceptSuggestion[]) {
  const byLabel = new Map<string, ConceptSuggestion>();

  for (const suggestion of suggestions) {
    const label =
      suggestion.kind === "existing" ? suggestion.label : suggestion.suggestedLabel;
    const key = normalizeLabelForDeduplication(label);
    const current = byLabel.get(key);

    if (!current || shouldReplaceSuggestion(current, suggestion)) {
      byLabel.set(key, current ? mergeConceptSuggestionMetadata(suggestion, current) : suggestion);
    } else {
      byLabel.set(key, mergeConceptSuggestionMetadata(current, suggestion));
    }
  }

  return Array.from(byLabel.values()).sort((first, second) => {
    if (first.kind !== second.kind) {
      return first.kind === "existing" ? -1 : 1;
    }

    return second.score - first.score;
  });
}

function mergeConceptSuggestionMetadata(
  base: ConceptSuggestion,
  source: ConceptSuggestion,
): ConceptSuggestion {
  if (base.kind !== "existing" || source.kind !== "existing") {
    return base;
  }

  return {
    ...base,
    evidenceCaptureIds: mergeUniqueStrings(
      base.evidenceCaptureIds,
      source.evidenceCaptureIds,
    ),
    matchedTerms: mergeUniqueStrings(base.matchedTerms, source.matchedTerms),
    matchedAlias: base.matchedAlias ?? source.matchedAlias,
    knowledgeSuggestionKind:
      base.knowledgeSuggestionKind ?? source.knowledgeSuggestionKind,
    knowledgeSuggestionReasons: mergeUniqueStrings(
      base.knowledgeSuggestionReasons ?? [],
      source.knowledgeSuggestionReasons ?? [],
    ),
  };
}

function mergeUniqueStrings(first: string[], second: string[]) {
  return Array.from(new Set([...first, ...second]));
}

function getPresentConceptIds({
  conceptTraces,
  selectedContextIds,
}: {
  conceptTraces: SuggestionDiagnostics["conceptTraces"];
  selectedContextIds: string[];
}) {
  return Array.from(
    new Set([
      ...selectedContextIds,
      ...conceptTraces
        .filter((trace) => trace.directMatches > 0)
        .map((trace) => trace.context.id),
    ]),
  ).sort();
}

function shouldReplaceSuggestion(
  current: ConceptSuggestion,
  candidate: ConceptSuggestion,
) {
  if (current.kind !== candidate.kind) {
    return candidate.kind === "existing";
  }

  if (current.kind === "existing" && candidate.kind === "existing") {
    const currentHasKnowledgeKind = Boolean(current.knowledgeSuggestionKind);
    const candidateHasKnowledgeKind = Boolean(candidate.knowledgeSuggestionKind);

    if (currentHasKnowledgeKind !== candidateHasKnowledgeKind) {
      return candidateHasKnowledgeKind;
    }

    if (
      current.knowledgeSuggestionKind &&
      candidate.knowledgeSuggestionKind &&
      current.knowledgeSuggestionKind !== candidate.knowledgeSuggestionKind
    ) {
      return (
        getKnowledgeSuggestionKindPriority(candidate.knowledgeSuggestionKind) <
        getKnowledgeSuggestionKindPriority(current.knowledgeSuggestionKind)
      );
    }
  }

  return candidate.score > current.score;
}

function getKnowledgeSuggestionKindPriority(
  kind: NonNullable<
    Extract<ConceptSuggestion, { kind: "existing" }>["knowledgeSuggestionKind"]
  >,
) {
  return kind === "REVISIT" ? 1 : kind === "MISSING_CONTEXT" ? 2 : 3;
}

function hasEquivalentExistingConcept(label: string, suggestions: ConceptSuggestion[]) {
  const normalizedLabel = normalizeLabelForDeduplication(label);
  const existingContexts = suggestions
    .filter((suggestion): suggestion is Extract<ConceptSuggestion, { kind: "existing" }> =>
      suggestion.kind === "existing",
    )
    .map((suggestion) => suggestion.context);
  const resolution = resolveConceptIdentity(label, existingContexts);

  if (resolution.status === "EXACT" || resolution.status === "ALIAS") {
    return true;
  }

  if (resolution.status === "AMBIGUOUS") {
    return true;
  }

  return suggestions.some(
    (suggestion) =>
      suggestion.kind === "existing" &&
      normalizeLabelForDeduplication(suggestion.label) === normalizedLabel,
  );
}

export function normalizeLabel(label: string) {
  return normalizeAssociationText(label)
    .replace(/\breunion\b/g, "reuniones")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLabelForDeduplication(label: string) {
  const normalized = normalizeLabel(label);
  const terms = normalized.split(" ").filter(Boolean);

  if (terms.length < 2) {
    return normalized;
  }

  return terms.sort().join(" ");
}

function stableHash(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}
