import type { Node } from "@/domain/node/node";

export function getNodeDisplayTitle(node: Pick<Node, "title" | "content">) {
  const title = node.title.trim();

  if (title.length > 0) {
    return title;
  }

  const fallback = node.content.trim().split(/\s+/).slice(0, 8).join(" ");
  return fallback || "Sin titulo";
}

export function getContentExcerpt(content: string, maxLength = 140) {
  const normalized = content.trim().replace(/\s+/g, " ");

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

export function createTitleFromContent(content: string) {
  return content.trim().split(/\s+/).slice(0, 8).join(" ") || "Sin titulo";
}
