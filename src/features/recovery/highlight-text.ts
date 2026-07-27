export type HighlightPart = {
  text: string;
  highlighted: boolean;
};

export function createHighlightedParts(
  text: string,
  query: string,
): HighlightPart[] {
  const tokens = Array.from(
    new Set(query.trim().split(/\s+/).filter(Boolean)),
  );

  if (tokens.length === 0 || text.length === 0) {
    return [{ text, highlighted: false }];
  }

  const expression = new RegExp(
    `(${tokens.map(escapeRegExp).join("|")})`,
    "gi",
  );
  const parts: HighlightPart[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(expression)) {
    const matchText = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, index), highlighted: false });
    }

    parts.push({ text: matchText, highlighted: true });
    lastIndex = index + matchText.length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlighted: false });
  }

  return parts.length > 0 ? parts : [{ text, highlighted: false }];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
