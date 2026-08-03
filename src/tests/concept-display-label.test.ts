import { describe, expect, it } from "vitest";
import { normalizeConceptDisplayLabel } from "@/features/concepts/concept-display-label";

describe("normalizeConceptDisplayLabel", () => {
  it("uses sentence case for common concepts without title-casing connectors", () => {
    expect(normalizeConceptDisplayLabel("estado de pago")).toBe("Estado de pago");
    expect(normalizeConceptDisplayLabel("ESTADO DE PAGO")).toBe("Estado de pago");
    expect(normalizeConceptDisplayLabel("base de conocimiento")).toBe(
      "Base de conocimiento",
    );
    expect(normalizeConceptDisplayLabel("motor semántico")).toBe("Motor semántico");
  });

  it("preserves proper names, acronyms and technical terms", () => {
    expect(normalizeConceptDisplayLabel("Tom Ford")).toBe("Tom Ford");
    expect(normalizeConceptDisplayLabel("Mina Andes Norte")).toBe(
      "Mina Andes Norte",
    );
    expect(normalizeConceptDisplayLabel("Operational Core")).toBe(
      "Operational Core",
    );
    expect(normalizeConceptDisplayLabel("MITCOM")).toBe("MITCOM");
    expect(normalizeConceptDisplayLabel("OC")).toBe("OC");
    expect(normalizeConceptDisplayLabel("PWA")).toBe("PWA");
    expect(normalizeConceptDisplayLabel("Next.js")).toBe("Next.js");
    expect(normalizeConceptDisplayLabel("PostgreSQL")).toBe("PostgreSQL");
    expect(normalizeConceptDisplayLabel("IndexedDB")).toBe("IndexedDB");
    expect(normalizeConceptDisplayLabel("VIN-014I")).toBe("VIN-014I");
    expect(normalizeConceptDisplayLabel("212 VIP Black")).toBe("212 VIP Black");
  });
});
