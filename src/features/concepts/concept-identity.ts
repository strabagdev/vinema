import type { Context } from "@/domain/context/context";
import { isSpanishStopword } from "@/features/associations/spanish-stopwords";

export type ConceptIdentity = {
  id: string;
  canonicalLabel: string;
  normalizedCanonicalLabel: string;
  aliases: string[];
  normalizedAliases: string[];
};

export type ConceptResolutionResult =
  | {
      status: "EXACT" | "ALIAS";
      conceptId: string;
      concept: Context;
      matchedText: string;
      canonicalLabel: string;
      matchedAlias?: string;
    }
  | {
      status: "AMBIGUOUS";
      candidates: Context[];
      matchedText: string;
    }
  | {
      status: "NEW";
      matchedText: string;
    };

const CONNECTOR_WORDS = new Set(["de", "del", "la", "las", "el", "los", "y", "and"]);

export function createConceptIdentity(context: Context): ConceptIdentity {
  const aliases = normalizeAliasList(context.aliases ?? []);
  const normalizedAliases = normalizeAliasList([
    ...(context.normalizedAliases ?? []),
    ...aliases.map(normalizeConceptIdentityLabel),
  ]);

  return {
    id: context.id,
    canonicalLabel: context.name,
    normalizedCanonicalLabel: normalizeConceptIdentityLabel(context.name),
    aliases,
    normalizedAliases,
  };
}

export function resolveConceptIdentity(
  matchedText: string,
  contexts: Context[],
): ConceptResolutionResult {
  const text = matchedText.trim();

  if (!isConceptIdentityLookupCandidate(text)) {
    return { status: "NEW", matchedText };
  }

  const exactCanonical = contexts.filter(
    (context) => context.name.trim() === text,
  );
  const exactCanonicalResolution = resolveUniqueOrAmbiguous(exactCanonical, text, "EXACT");

  if (exactCanonicalResolution) {
    return exactCanonicalResolution;
  }

  const normalizedText = normalizeConceptIdentityLabel(text);
  const normalizedCompactText = createCompactConceptIdentityKey(text);
  const normalizedCanonical = contexts.filter((context) => {
    const identity = createConceptIdentity(context);
    return (
      identity.normalizedCanonicalLabel === normalizedText ||
      createCompactConceptIdentityKey(identity.canonicalLabel) === normalizedCompactText
    );
  });
  const normalizedCanonicalResolution = resolveUniqueOrAmbiguous(
    normalizedCanonical,
    text,
    "EXACT",
  );

  if (normalizedCanonicalResolution) {
    return normalizedCanonicalResolution;
  }

  const exactAlias = contexts.filter((context) =>
    (context.aliases ?? []).some((alias) => alias.trim() === text),
  );
  const exactAliasResolution = resolveUniqueOrAmbiguous(exactAlias, text, "ALIAS");

  if (exactAliasResolution) {
    return withMatchedAlias(exactAliasResolution, text);
  }

  const normalizedAlias = contexts.filter((context) => {
    const identity = createConceptIdentity(context);
    return identity.normalizedAliases.some((alias) => alias === normalizedText) ||
      identity.aliases.some(
        (alias) => createCompactConceptIdentityKey(alias) === normalizedCompactText,
      );
  });
  const normalizedAliasResolution = resolveUniqueOrAmbiguous(
    normalizedAlias,
    text,
    "ALIAS",
  );

  if (normalizedAliasResolution) {
    return withMatchedAlias(normalizedAliasResolution, text);
  }

  const acronymMatches = isDerivedAcronymLookupCandidate(text)
    ? contexts.filter(
        (context) => deriveConceptAcronym(context.name) === normalizeAcronym(text),
      )
    : [];
  const acronymResolution = resolveUniqueOrAmbiguous(acronymMatches, text, "ALIAS");

  if (acronymResolution) {
    return withMatchedAlias(acronymResolution, text);
  }

  return { status: "NEW", matchedText: text };
}

export function normalizeConceptIdentityLabel(value: string): string {
  return splitCompactWords(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");
}

export function createCompactConceptIdentityKey(value: string): string {
  return normalizeConceptIdentityLabel(value).replace(/\s+/g, "");
}

export function normalizeContextAliases(context: Context): Context {
  const aliases = normalizeAliasList(context.aliases ?? []);
  const normalizedAliases = normalizeAliasList([
    ...(context.normalizedAliases ?? []),
    ...aliases.map(normalizeConceptIdentityLabel),
  ]);

  return {
    ...context,
    aliases,
    normalizedAliases,
  };
}

export function deriveConceptAcronym(label: string): string {
  return normalizeConceptIdentityLabel(label)
    .split(" ")
    .filter((word) => word && !CONNECTOR_WORDS.has(word))
    .map((word) => word[0]?.toLocaleUpperCase("es") ?? "")
    .join("");
}

export function hasConceptIdentityMatch(
  context: Context,
  text: string,
): { matchedText: string; matchedAlias?: string } | null {
  const resolution = resolveConceptIdentity(text, [context]);

  if (resolution.status === "EXACT" || resolution.status === "ALIAS") {
    return {
      matchedText: resolution.matchedText,
      matchedAlias: resolution.matchedAlias,
    };
  }

  return null;
}

export function isConceptIdentityLookupCandidate(value: string) {
  const text = value.trim();

  if (!text || !/[\p{L}\p{N}]/u.test(text)) {
    return false;
  }

  const normalizedText = normalizeConceptIdentityLabel(text);

  if (!normalizedText) {
    return false;
  }

  if (normalizedText.length === 1) {
    return isConfirmedOneLetterAcronym(text);
  }

  return !isSingleStopword(normalizedText);
}

function resolveUniqueOrAmbiguous(
  candidates: Context[],
  matchedText: string,
  status: "EXACT" | "ALIAS",
): ConceptResolutionResult | null {
  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length > 1) {
    return {
      status: "AMBIGUOUS",
      candidates: [...candidates].sort((first, second) =>
        first.name.localeCompare(second.name),
      ),
      matchedText,
    };
  }

  const [concept] = candidates;

  return {
    status,
    conceptId: concept.id,
    concept,
    matchedText,
    canonicalLabel: concept.name,
  };
}

function withMatchedAlias(
  resolution: ConceptResolutionResult,
  matchedText: string,
): ConceptResolutionResult {
  if (resolution.status !== "ALIAS") {
    return resolution;
  }

  return {
    ...resolution,
    matchedAlias: matchedText,
  };
}

function normalizeAliasList(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ");

    if (!normalized) {
      continue;
    }

    const key = normalizeConceptIdentityLabel(normalized);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function isDerivedAcronymLookupCandidate(value: string) {
  const normalizedText = normalizeConceptIdentityLabel(value);

  return normalizedText.length > 1 && !isSingleStopword(normalizedText);
}

function isSingleStopword(value: string) {
  return !value.includes(" ") && isSpanishStopword(value);
}

function isConfirmedOneLetterAcronym(value: string) {
  const text = value.trim();

  return /^[A-ZÑ]$/u.test(text) && !isSingleStopword(normalizeConceptIdentityLabel(text));
}

function normalizeAcronym(value: string) {
  return normalizeConceptIdentityLabel(value)
    .replace(/\s+/g, "")
    .toLocaleUpperCase("es");
}

function splitCompactWords(value: string) {
  return value
    .replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, "$1 $2")
    .replace(/([\p{Lu}]+)([\p{Lu}][\p{Ll}])/gu, "$1 $2");
}
