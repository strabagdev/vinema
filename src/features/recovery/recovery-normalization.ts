export function normalizeRecoveryText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenizeRecoveryQuery(query: string): string[] {
  const normalizedQuery = normalizeRecoveryText(query);

  if (!normalizedQuery) {
    return [];
  }

  return Array.from(new Set(normalizedQuery.split(" ").filter(Boolean)));
}
