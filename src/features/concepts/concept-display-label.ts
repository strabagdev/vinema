const CONNECTOR_WORDS = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "e",
  "el",
  "en",
  "la",
  "las",
  "los",
  "para",
  "por",
  "y",
]);

const KNOWN_TECHNICAL_TERMS = new Map([
  ["indexeddb", "IndexedDB"],
  ["next.js", "Next.js"],
  ["postgresql", "PostgreSQL"],
  ["railway", "Railway"],
]);

export function normalizeConceptDisplayLabel(value: string): string {
  const compact = value.trim().replace(/\s+/g, " ");

  if (!compact) {
    return "";
  }

  const knownTerm = KNOWN_TECHNICAL_TERMS.get(compact.toLocaleLowerCase("es"));
  if (knownTerm) {
    return knownTerm;
  }

  if (hasMeaningfulMixedCase(compact) || hasTechnicalShape(compact)) {
    return compact;
  }

  if (isLikelyAcronym(compact)) {
    return compact.toLocaleUpperCase("es");
  }

  return toSentenceCase(compact);
}

function hasMeaningfulMixedCase(value: string) {
  return /[A-ZÁÉÍÓÚÑ]/.test(value) && /[a-záéíóúñ]/.test(value);
}

function hasTechnicalShape(value: string) {
  return /\b[A-Z]+-\d+[A-Z0-9]*\b/.test(value) ||
    /\b\d+\s+[A-Z]{2,}\b/.test(value) ||
    /[a-zA-Z]\.[a-zA-Z]/.test(value);
}

function isLikelyAcronym(value: string) {
  const words = value.split(" ");

  if (words.length === 1) {
    return /^[A-Z0-9]{2,6}$/.test(value);
  }

  if (words.length > 3) {
    return false;
  }

  return words.every((word) => /^[A-Z0-9]{2,4}$/.test(word));
}

function toSentenceCase(value: string) {
  const lower = value.toLocaleLowerCase("es");
  const chars = Array.from(lower);
  const firstLetterIndex = chars.findIndex((char) => /\p{L}/u.test(char));

  if (firstLetterIndex === -1) {
    return lower;
  }

  chars[firstLetterIndex] = chars[firstLetterIndex].toLocaleUpperCase("es");

  return restoreKnownTerms(chars.join(""));
}

function restoreKnownTerms(value: string) {
  return value
    .split(" ")
    .map((word) => {
      const normalized = word.toLocaleLowerCase("es");
      if (CONNECTOR_WORDS.has(normalized)) {
        return normalized;
      }

      return KNOWN_TECHNICAL_TERMS.get(normalized) ?? word;
    })
    .join(" ");
}
