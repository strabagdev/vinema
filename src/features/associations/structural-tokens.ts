const MAX_SHORT_TOKEN_LENGTH = 3;

export function normalizeStructuralToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

export function isShortStructuralToken(value: string) {
  const normalized = normalizeStructuralToken(value);

  return (
    normalized.length > 0 &&
    normalized.length <= MAX_SHORT_TOKEN_LENGTH &&
    !/\p{N}/u.test(normalized)
  );
}
