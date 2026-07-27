export function createWordNgrams(tokens: string[], size: 2 | 3) {
  if (tokens.length < size) {
    return [];
  }

  return Array.from({ length: tokens.length - size + 1 }, (_, index) =>
    tokens.slice(index, index + size).join(" "),
  );
}

export function createCharacterTrigrams(value: string) {
  const compact = value.replace(/\s+/g, " ");

  if (compact.length < 3) {
    return [];
  }

  return Array.from({ length: compact.length - 2 }, (_, index) =>
    compact.slice(index, index + 3),
  );
}

export function overlapRatio(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const bSet = new Set(b);
  const overlap = new Set(a.filter((value) => bSet.has(value))).size;

  return overlap / Math.max(new Set(a).size, 1);
}
