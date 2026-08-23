import { normalizeAssociationText } from "@/features/associations/normalize-text";
import { SPANISH_STOPWORDS } from "@/features/associations/spanish-stopwords";
import {
  tokenizeAssociationText,
  uniqueTokens,
} from "@/features/associations/tokenize";

const LOCAL_SUPPORT_STOPWORDS = new Set([
  ...SPANISH_STOPWORDS,
  "actual",
  "captura",
  "capturas",
  "concepto",
  "conceptos",
  "contenido",
  "control",
  "contexto",
  "forma",
  "general",
  "mayor",
  "menor",
  "memoria",
  "memorias",
  "nuevo",
  "nueva",
  "relacion",
  "relaciones",
  "requier",
  "requiere",
  "requieren",
  "requerir",
  "revision",
  "revis",
  "revisar",
  "suficiente",
]);

export const HUMAN_ENTITY_TERMS = new Set([
  "cliente",
  "clientes",
  "estudiante",
  "estudiantes",
  "paciente",
  "pacientes",
  "persona",
  "personas",
  "peaton",
  "peatones",
  "trabajador",
  "trabajadores",
  "usuario",
  "usuarios",
]);

const INCREASE_TERMS = new Set([
  "aumenta",
  "aumentan",
  "aumentar",
  "incrementa",
  "incrementan",
  "incrementar",
  "eleva",
  "elevan",
  "elevar",
]);

const DECREASE_TERMS = new Set([
  "baja",
  "bajan",
  "bajar",
  "disminuye",
  "disminuyen",
  "disminuir",
  "reduce",
  "reducen",
  "reducir",
]);

const IMPROVE_TERMS = new Set([
  "mejora",
  "mejoran",
  "mejorar",
  "optimiza",
  "optimizan",
  "optimizar",
]);

const WORSEN_TERMS = new Set([
  "deteriora",
  "deterioran",
  "deteriorar",
  "dificulta",
  "dificultan",
  "dificultar",
  "empeora",
  "empeoran",
  "empeorar",
]);

const ENABLE_TERMS = new Set([
  "facilita",
  "facilitan",
  "facilitar",
  "habilita",
  "habilitan",
  "habilitar",
  "permite",
  "permiten",
  "permitir",
]);

const BLOCK_TERMS = new Set([
  "bloquea",
  "bloquean",
  "bloquear",
  "evita",
  "evitan",
  "evitar",
  "impide",
  "impiden",
  "impedir",
]);

type DirectionPolarity = "increase" | "decrease" | "improve" | "worsen" | "enable" | "block";

type DirectionalMention = {
  polarity: DirectionPolarity;
  terms: Set<string>;
  negated: boolean;
};

export function getMeaningfulLocalSupportTokens(text: string) {
  return uniqueTokens(tokenizeAssociationText(text)).filter(
    (token) =>
      !LOCAL_SUPPORT_STOPWORDS.has(token) &&
      !isDirectionalSupportToken(token),
  );
}

export function hasMeaningfulLocalTokenOverlap(first: string, second: string) {
  const firstTokens = new Set(getMeaningfulLocalSupportTokens(first));

  if (firstTokens.size === 0) {
    return false;
  }

  return getMeaningfulLocalSupportTokens(second).some((token) =>
    firstTokens.has(token),
  );
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
    const thematicLabelTokens = labelTokens.filter(
      (token) => !HUMAN_ENTITY_TERMS.has(token),
    );

    if (labelTokens.length === 0) {
      return false;
    }

    if (thematicLabelTokens.some((token) => localTokens.has(token))) {
      return true;
    }

    return false;
  });
}

export function hasDirectionalContradiction(first: string, second: string) {
  const firstMentions = extractDirectionalMentions(first);
  const secondMentions = extractDirectionalMentions(second);

  return firstMentions.some((firstMention) =>
    secondMentions.some(
      (secondMention) =>
        areOpposingDirections(firstMention, secondMention) &&
        haveSharedDirectionalScope(firstMention.terms, secondMention.terms),
    ),
  );
}

function extractDirectionalMentions(text: string) {
  const words = normalizeAssociationText(text).split(/\s+/).filter(Boolean);
  const mentions: DirectionalMention[] = [];

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index] ?? "";
    const polarity = getDirectionPolarity(word);

    if (!polarity) {
      continue;
    }

    mentions.push({
      polarity,
      terms: new Set(extractDirectionalScope(words, index)),
      negated: isNegatedNear(words, index),
    });
  }

  return mentions;
}

function extractDirectionalScope(words: string[], directionIndex: number) {
  return words
    .slice(Math.max(0, directionIndex - 5), directionIndex + 6)
    .filter((word, index) => Math.max(0, directionIndex - 5) + index !== directionIndex)
    .filter((word) => !LOCAL_SUPPORT_STOPWORDS.has(word))
    .filter((word) => !getDirectionPolarity(word));
}

function isNegatedNear(words: string[], directionIndex: number) {
  return words
    .slice(Math.max(0, directionIndex - 3), directionIndex)
    .some((word) => word === "no" || word === "nunca" || word === "sin");
}

function getDirectionPolarity(word: string): DirectionPolarity | null {
  if (INCREASE_TERMS.has(word)) {
    return "increase";
  }

  if (DECREASE_TERMS.has(word)) {
    return "decrease";
  }

  if (IMPROVE_TERMS.has(word)) {
    return "improve";
  }

  if (WORSEN_TERMS.has(word)) {
    return "worsen";
  }

  if (ENABLE_TERMS.has(word)) {
    return "enable";
  }

  if (BLOCK_TERMS.has(word)) {
    return "block";
  }

  return null;
}

function isDirectionalSupportToken(token: string) {
  return (
    INCREASE_TERMS.has(token) ||
    DECREASE_TERMS.has(token) ||
    IMPROVE_TERMS.has(token) ||
    WORSEN_TERMS.has(token) ||
    ENABLE_TERMS.has(token) ||
    BLOCK_TERMS.has(token)
  );
}

function areOpposingDirections(
  first: DirectionalMention,
  second: DirectionalMention,
) {
  if (first.negated !== second.negated) {
    return true;
  }

  return (
    isOpposingPolarity(first.polarity, second.polarity) ||
    isOpposingPolarity(second.polarity, first.polarity)
  );
}

function isOpposingPolarity(first: DirectionPolarity, second: DirectionPolarity) {
  return (
    (first === "increase" && second === "decrease") ||
    (first === "improve" && second === "worsen") ||
    (first === "enable" && second === "block")
  );
}

function haveSharedDirectionalScope(first: Set<string>, second: Set<string>) {
  if (first.size === 0 || second.size === 0) {
    return true;
  }

  return Array.from(first).some((token) => second.has(token));
}
