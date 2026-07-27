import { describe, expect, it } from "vitest";
import { getCapturePreview } from "@/features/node/node-display";

describe("capture preview", () => {
  it("uses short content as-is after trimming", () => {
    expect(getCapturePreview("  Captura breve  ")).toBe("Captura breve");
  });

  it("collapses multiple spaces and line breaks", () => {
    expect(getCapturePreview("Primera linea\n\nsegunda   linea")).toBe(
      "Primera linea segunda linea",
    );
  });

  it("truncates long content without cutting words when possible", () => {
    expect(
      getCapturePreview("uno dos tres cuatro cinco seis", { maxLength: 18 }),
    ).toBe("uno dos tres…");
  });

  it("handles empty and invalid historical content with a fallback", () => {
    expect(getCapturePreview("   ")).toBe("Captura sin contenido");
    expect(getCapturePreview(null)).toBe("Captura sin contenido");
  });

  it("preserves unicode, emoji and accents", () => {
    expect(getCapturePreview("Reunión con María ✨")).toBe("Reunión con María ✨");
  });
});
