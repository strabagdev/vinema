import { isMeaningfulLocalSupportToken } from "@/features/associations/local-support";
import { tokenizeAssociationText } from "@/features/associations/tokenize";
import { isShortStructuralToken } from "@/features/associations/structural-tokens";
import type { SemanticPhraseCandidate } from "@/features/semantics/semantic-phrase-extractor";
import { hasSemanticUppercase, hasTechnicalShape, tokenizeSemanticText } from "@/features/semantics/semantic-tokenizer";

const LOCAL_CONCEPT_ACTION_TERMS = new Set([
  "busca",
  "circulando",
  "cuesta",
  "convertirse",
  "detectar",
  "depende",
  "dificultar",
  "disminuye",
  "dormir",
  "existen",
  "ingresan",
  "mantener",
  "mejorar",
  "mejoro",
  "necesito",
  "opera",
  "permite",
  "puede",
  "presentan",
  "presentar",
  "rapidamente",
  "revisar",
  "redujo",
  "resumirse",
  "tarde",
  "tardiamente",
]);

const LOCAL_CONCEPT_WEAK_BOUNDARY_TERMS = new Set([
  "antes",
  "cuando",
  "dentro",
  "donde",
  "durante",
  "hora",
  "mañana",
  "manana",
  "mayor",
  "mediante",
  "para",
  "semanas",
  "sectores",
  "tiempo",
  "ultima",
  "ultimas",
]);

const LOCAL_CONCEPT_INVALID_CONNECTORS = new Set([
  "a",
  "es",
  "esta",
  "estan",
  "fue",
  "son",
]);

export type ConceptualityAssessment = {
  accepted: boolean;
  signals: {
    specific: boolean;
    autonomous: boolean;
    episodic: boolean;
    dependent: boolean;
  };
  reasons: string[];
};

// These signals assess a fragment; they neither assign its evidence origin nor rank it.
export function assessConceptuality(
  candidate: SemanticPhraseCandidate,
  fullText: string,
): ConceptualityAssessment {
  const surfaceText = fullText.slice(candidate.start, candidate.end);
  const surface = tokenizeSemanticText(surfaceText);
  const values = surface.map((token) => token.normalizedText);
  const terms = candidate.tokens.filter(isMeaningfulLocalSupportToken);
  const first = values[0] ?? "";
  const last = values.at(-1) ?? "";
  const prefix = tokenizeSemanticText(fullText.slice(0, candidate.start));
  const startsWithAction = isInfinitiveActionTerm(tokenizeAssociationText(surfaceText)[0] ?? first);
  const isActionObject = isInfinitiveActionTerm(prefix[0]?.normalizedText ?? "") &&
    prefix.slice(1).every((token) => isShortStructuralToken(token.normalizedText));
  const recurring = /\btod(?:o|a|os|as)\s+(?:los|las)\b/iu.test(fullText);
  const technical = surface.every((token) => hasTechnicalShape(token.text));
  const nominal = candidate.source !== "CAPITALIZED_PHRASE" &&
    candidate.source !== "HISTORICAL_EVIDENCE";
  const initialNominal = candidate.start === 0 &&
    (surfaceText.trim() === fullText.trim() ||
      !surface.every((token) => hasSemanticUppercase(token.text)));

  const signals = {
    specific: terms.length > 0 && (terms.length > 1 || candidate.source === "KNOWN_TERM" ||
      terms.some((term) => term.length >= 8)),
    autonomous: terms.length === 1 || nominal || technical || initialNominal,
    episodic: values.some((value) => LOCAL_CONCEPT_ACTION_TERMS.has(value)) ||
      (startsWithAction && !recurring) ||
      (terms.length === 1 && isActionObject),
    dependent: /[,()[\]{}]/u.test(surfaceText) ||
      LOCAL_CONCEPT_WEAK_BOUNDARY_TERMS.has(first) ||
      LOCAL_CONCEPT_WEAK_BOUNDARY_TERMS.has(last) ||
      values.some((value) => LOCAL_CONCEPT_INVALID_CONNECTORS.has(value)),
  };
  return {
    accepted: signals.specific && signals.autonomous && !signals.episodic && !signals.dependent,
    signals,
    reasons: [
      signals.specific ? "specific-fragment" : "insufficient-specificity",
      signals.autonomous ? "autonomous-fragment" : "context-dependent-name",
      signals.episodic ? "episodic-action" : "reusable-unit",
      signals.dependent ? "circumstantial-fragment" : "stable-boundaries",
    ],
  };
}

// One surface test for infinitives, including Spanish enclitic object pronouns.
export function isInfinitiveActionTerm(term: string) {
  return /^(?:ir|[\p{L}]{3,}(?:ar|er|ir))(?:me|te|se|nos|os|le|les|lo|la|los|las)?$/u.test(term);
}
