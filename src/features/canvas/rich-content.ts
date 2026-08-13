import type { JSONContent } from "@tiptap/react";
import { defaultMarkdownParser } from "prosemirror-markdown";

export const RICH_CONTENT_FORMAT_VERSION = 1;

const EMPTY_DOCUMENT: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

type MarkState = {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  link?: string;
};

export function createEmptyRichDocument(): JSONContent {
  return cloneJsonContent(EMPTY_DOCUMENT);
}

export function markdownToRichDocument(markdown: string): JSONContent {
  if (!markdown.trim()) {
    return createEmptyRichDocument();
  }

  try {
    const parsed = defaultMarkdownParser.parse(markdown);
    const mapped = mapProseMirrorJsonToTipTap(parsed.toJSON()) ?? createEmptyRichDocument();

    return normalizeTaskMarkdownDocument(mapped, markdown);
  } catch {
    return plainTextToRichDocument(markdown);
  }
}

export function richDocumentToMarkdown(document: JSONContent): string {
  const content = document.content ?? [];
  const markdown = content.map((node) => serializeBlock(node, 0)).join("\n\n").trimEnd();

  return markdown;
}

export function richDocumentToPlainText(document: JSONContent): string {
  const blocks = document.content ?? [];

  return blocks
    .map((node) => getNodePlainText(node))
    .filter((text, index, all) => text.trim() || index < all.length - 1)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function plainTextToRichDocument(text: string): JSONContent {
  const paragraphs = text.split(/\n{2,}/).map((paragraph) => ({
    type: "paragraph",
    content: paragraph
      ? [{ type: "text", text: paragraph.replace(/\n/g, " ") }]
      : undefined,
  }));

  return {
    type: "doc",
    content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }],
  };
}

export function sanitizeRichTextUrl(input: string | null): string | null {
  if (!input) {
    return null;
  }

  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("/") || trimmed.startsWith("#")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);

    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    try {
      const parsed = new URL(`https://${trimmed}`);

      return parsed.hostname.includes(".") ? parsed.toString() : null;
    } catch {
      return null;
    }
  }
}

function cloneJsonContent(content: JSONContent): JSONContent {
  return JSON.parse(JSON.stringify(content)) as JSONContent;
}

function mapProseMirrorJsonToTipTap(node: JSONContent): JSONContent | null {
  const type = mapNodeType(node.type);

  if (!type) {
    return null;
  }

  const content = (node.content ?? [])
    .map(mapProseMirrorJsonToTipTap)
    .filter((item): item is JSONContent => item !== null);
  const marks = (node.marks ?? [])
    .map((mark) => ({
      ...mark,
      type: mapMarkType(mark.type),
    }))
    .filter((mark): mark is { type: string; attrs?: Record<string, unknown> } =>
      Boolean(mark.type),
    );

  return {
    type,
    attrs: node.attrs,
    text: node.text,
    content: content.length > 0 ? content : undefined,
    marks: marks.length > 0 ? marks : undefined,
  };
}

function mapNodeType(type: string | undefined) {
  switch (type) {
    case "doc":
    case "paragraph":
    case "text":
    case "heading":
    case "blockquote":
    case "bulletList":
    case "orderedList":
    case "listItem":
    case "horizontalRule":
    case "hardBreak":
    case "codeBlock":
      return type;
    default:
      return null;
  }
}

function mapMarkType(type: string | undefined) {
  switch (type) {
    case "strong":
      return "bold";
    case "em":
      return "italic";
    case "code":
    case "link":
      return type;
    default:
      return null;
  }
}

function normalizeTaskMarkdownDocument(document: JSONContent, markdown: string): JSONContent {
  const lines = markdown.split("\n");

  if (!lines.some((line) => /^[-*]\s+\[[ xX]\]\s+/.test(line))) {
    return document;
  }

  const blocks: JSONContent[] = [];
  let taskItems: JSONContent[] = [];

  function flushTasks() {
    if (taskItems.length === 0) {
      return;
    }

    blocks.push({
      type: "taskList",
      content: taskItems,
    });
    taskItems = [];
  }

  for (const line of lines) {
    const task = /^[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line);

    if (task) {
      taskItems.push({
        type: "taskItem",
        attrs: { checked: task[1].toLowerCase() === "x" },
        content: [
          {
            type: "paragraph",
            content: task[2] ? [{ type: "text", text: task[2] }] : undefined,
          },
        ],
      });
      continue;
    }

    flushTasks();

    if (line.trim()) {
      blocks.push({
        type: "paragraph",
        content: [{ type: "text", text: line }],
      });
    }
  }

  flushTasks();

  return blocks.length > 0 ? { type: "doc", content: blocks } : document;
}

function serializeBlock(node: JSONContent, depth: number): string {
  switch (node.type) {
    case "heading":
      return `${"#".repeat(Number(node.attrs?.level ?? 1))} ${serializeInlineContent(node)}`;
    case "paragraph":
      return serializeInlineContent(node);
    case "blockquote":
      return serializeChildBlocks(node, depth)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "bulletList":
      return serializeList(node, depth, false);
    case "orderedList":
      return serializeList(node, depth, true);
    case "taskList":
      return serializeTaskList(node, depth);
    case "horizontalRule":
      return "---";
    case "codeBlock":
      return `\`\`\`\n${getNodePlainText(node)}\n\`\`\``;
    default:
      return serializeChildBlocks(node, depth);
  }
}

function serializeChildBlocks(node: JSONContent, depth: number): string {
  return (node.content ?? []).map((child) => serializeBlock(child, depth)).join("\n\n");
}

function serializeList(node: JSONContent, depth: number, ordered: boolean): string {
  return (node.content ?? [])
    .map((item, index) => {
      const marker = ordered ? `${index + 1}.` : "-";
      const body = serializeChildBlocks(item, depth + 1).replace(/\n/g, `\n${"  ".repeat(depth + 1)}`);

      return `${"  ".repeat(depth)}${marker} ${body}`;
    })
    .join("\n");
}

function serializeTaskList(node: JSONContent, depth: number): string {
  return (node.content ?? [])
    .map((item) => {
      const checked = item.attrs?.checked ? "x" : " ";
      const body = serializeChildBlocks(item, depth + 1).replace(/\n/g, `\n${"  ".repeat(depth + 1)}`);

      return `${"  ".repeat(depth)}- [${checked}] ${body}`;
    })
    .join("\n");
}

function serializeInlineContent(node: JSONContent): string {
  return (node.content ?? []).map((child) => serializeInline(child)).join("");
}

function serializeInline(node: JSONContent): string {
  if (node.type === "hardBreak") {
    return "\n";
  }

  if (node.type !== "text") {
    return serializeInlineContent(node);
  }

  return applyMarks(escapeMarkdownText(node.text ?? ""), getMarkState(node));
}

function getMarkState(node: JSONContent): MarkState {
  return (node.marks ?? []).reduce<MarkState>((state, mark) => {
    if (mark.type === "bold") {
      return { ...state, bold: true };
    }

    if (mark.type === "italic") {
      return { ...state, italic: true };
    }

    if (mark.type === "code") {
      return { ...state, code: true };
    }

    if (mark.type === "link" && typeof mark.attrs?.href === "string") {
      const href = sanitizeRichTextUrl(mark.attrs.href);

      return href ? { ...state, link: href } : state;
    }

    return state;
  }, {});
}

function applyMarks(text: string, marks: MarkState): string {
  let value = text;

  if (marks.code) {
    value = `\`${value.replace(/`/g, "\\`")}\``;
  }

  if (marks.bold) {
    value = `**${value}**`;
  }

  if (marks.italic) {
    value = `_${value}_`;
  }

  if (marks.link) {
    value = `[${value}](${marks.link})`;
  }

  return value;
}

function escapeMarkdownText(text: string): string {
  return text.replace(/([\\[*_`])/g, "\\$1");
}

function getNodePlainText(node: JSONContent): string {
  if (node.type === "text") {
    return node.text ?? "";
  }

  if (node.type === "horizontalRule") {
    return "";
  }

  if (node.type === "hardBreak") {
    return "\n";
  }

  const content = node.content ?? [];
  const childText = content.map(getNodePlainText).join(
    node.type === "paragraph" || node.type === "heading" ? "" : "\n",
  );

  return childText;
}
