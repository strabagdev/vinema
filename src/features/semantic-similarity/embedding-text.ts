import { markdownToRichDocument, richDocumentToPlainText } from "@/features/canvas/rich-content";
import type { EmbeddingUsage } from "@/features/semantic-similarity/embedding-types";

export function captureMarkdownToEmbeddingText(markdown: string) {
  return normalizeEmbeddingText(
    richDocumentToPlainText(markdownToRichDocument(markdown)),
  );
}

export function normalizeEmbeddingText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t\f\v]+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function applyE5Prefix(text: string, usage: EmbeddingUsage) {
  return `${usage}: ${normalizeEmbeddingText(text)}`;
}

export function createEmbeddingSourceHash(text: string) {
  const normalized = normalizeEmbeddingText(text);
  let hash = 0x811c9dc5;

  for (const char of normalized) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}
