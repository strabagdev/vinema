import { describe, expect, it } from "vitest";
import {
  markdownToRichDocument,
  richDocumentToMarkdown,
  richDocumentToPlainText,
  sanitizeRichTextUrl,
} from "@/features/canvas/rich-content";

describe("rich canvas content", () => {
  it("opens existing plain text as a structured document without losing text", () => {
    const document = markdownToRichDocument("Desarrollo Vinema\n\nRevisar contrato");

    expect(document.type).toBe("doc");
    expect(richDocumentToPlainText(document)).toBe(
      "Desarrollo Vinema\nRevisar contrato",
    );
    expect(richDocumentToMarkdown(document)).toBe(
      "Desarrollo Vinema\n\nRevisar contrato",
    );
  });

  it("derives clean semantic text from visual headings and inline marks", () => {
    const document = markdownToRichDocument(
      "# Desarrollo\n\n**Codelco** e _integracion_ con `Vinema`",
    );

    expect(richDocumentToPlainText(document)).toBe(
      "Desarrollo\nCodelco e integracion con Vinema",
    );
  });

  it("serializes the initial block and inline formats to portable Markdown", () => {
    const markdown = richDocumentToMarkdown({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Titulo" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Codelco", marks: [{ type: "bold" }] },
            { type: "text", text: " y " },
            { type: "text", text: "Mitcom", marks: [{ type: "italic" }] },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Punto" }],
                },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Paso" }],
                },
              ],
            },
          ],
        },
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Revisar contrato" }],
                },
              ],
            },
          ],
        },
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Cita" }],
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Andes Norte",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
            { type: "text", text: " " },
            { type: "text", text: "inline", marks: [{ type: "code" }] },
          ],
        },
        { type: "horizontalRule" },
      ],
    });

    expect(markdown).toContain("## Titulo");
    expect(markdown).toContain("**Codelco**");
    expect(markdown).toContain("_Mitcom_");
    expect(markdown).toContain("- Punto");
    expect(markdown).toContain("1. Paso");
    expect(markdown).toContain("- [ ] Revisar contrato");
    expect(markdown).toContain("> Cita");
    expect(markdown).toContain("[Andes Norte](https://example.com/)");
    expect(markdown).toContain("`inline`");
    expect(markdown).toContain("---");
  });

  it("keeps semantic text stable when only visual syntax changes", () => {
    const plain = richDocumentToPlainText(markdownToRichDocument("Codelco"));
    const formatted = richDocumentToPlainText(markdownToRichDocument("**Codelco**"));

    expect(formatted).toBe(plain);
  });

  it("sanitizes unsafe links before serialization", () => {
    expect(sanitizeRichTextUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeRichTextUrl("https://vinema.local/memoria")).toBe(
      "https://vinema.local/memoria",
    );
  });
});
