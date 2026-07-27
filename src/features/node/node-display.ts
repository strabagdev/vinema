export function getCapturePreview(
  content: unknown,
  options: {
    maxLength?: number;
    fallback?: string;
  } = {},
) {
  const maxLength = options.maxLength ?? 160;
  const fallback = options.fallback ?? "Captura sin contenido";
  const normalized =
    typeof content === "string" ? content.trim().replace(/\s+/g, " ") : "";

  if (!normalized) {
    return fallback;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const limit = Math.max(1, maxLength - 1);
  const sliced = normalized.slice(0, limit);
  const lastSpace = sliced.lastIndexOf(" ");
  const truncated =
    lastSpace > Math.floor(limit * 0.6) ? sliced.slice(0, lastSpace) : sliced;

  return `${truncated.trim()}…`;
}

export function getContentExcerpt(content: unknown, maxLength = 140) {
  return getCapturePreview(content, {
    maxLength,
    fallback: "",
  });
}
