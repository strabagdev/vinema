import { describe, expect, it } from "vitest";
import { evaluateCaptureInput } from "@/features/associations/capture-input-evaluation";
import { extractSemanticPhraseCandidates } from "@/features/semantics/semantic-phrase-extractor";
import { tokenizeSemanticText } from "@/features/semantics/semantic-tokenizer";
import type { Context } from "@/domain/context/context";

describe("semantic phrase extraction", () => {
  it("tokenizes technical and compound names without destroying visible text", () => {
    const tokens = tokenizeSemanticText(
      "Ombre Leather, Next.js, VIN-013D y 212 VIP Black.",
    );

    expect(tokens.map((token) => token.text)).toEqual([
      "Ombre",
      "Leather",
      "Next.js",
      "VIN-013D",
      "y",
      "212",
      "VIP",
      "Black",
    ]);
    expect(tokens[2]).toMatchObject({
      text: "Next.js",
      normalizedText: "next js",
    });
  });

  it("extracts complete perfume concepts instead of isolated capitalized words", () => {
    const labels = labelsFor(
      "Los perfumes que quiero comprar son Ombre Leather de Tom Ford y Erba Pura.",
    );

    expect(labels).toEqual([
      "Ombre Leather",
      "Tom Ford",
      "Erba Pura",
      "Perfumes",
    ]);
    expect(labels).not.toEqual(
      expect.arrayContaining(["Ombre", "Leather", "Tom", "Ford", "Erba", "Pura"]),
    );
  });

  it("extracts technical, mining and nominal phrase concepts", () => {
    expect(labelsFor("Operational Core debe consolidar la gestión contractual.")).toEqual([
      "Operational Core",
      "Gestión contractual",
    ]);
    expect(labelsFor("La reunión con Mitcom se realizará en Mina Andes Norte.")).toEqual(
      expect.arrayContaining(["Mina Andes Norte", "Mitcom", "Reunión"]),
    );
    expect(labelsFor("Necesitamos revisar la sincronización automática de Vinema con Railway.")).toEqual(
      expect.arrayContaining(["Sincronización automática", "Vinema", "Railway"]),
    );
  });

  it("preserves known technical expressions and connector phrases", () => {
    expect(labelsFor("Access Tracking debe usar PostgreSQL y Next.js.")).toEqual([
      "Access Tracking",
      "PostgreSQL",
      "Next.js",
    ]);
    expect(labelsFor("El Teniente y Banco de Chile revisan 212 VIP Black.")).toEqual([
      "El Teniente",
      "Banco de Chile",
      "212 VIP Black",
    ]);
    expect(labelsFor("La base de conocimiento necesita un motor de conceptos.")).toEqual([
      "Base de conocimiento",
      "Motor de conceptos",
    ]);
  });

  it("suppresses contained terms and generic fragments", () => {
    const labels = labelsFor(
      "para continuar esta prueba quiero comprar Ombre Leather de Tom Ford",
    );

    expect(labels).toContain("Ombre Leather");
    expect(labels).toContain("Tom Ford");
    expect(labels).not.toEqual(
      expect.arrayContaining(["continuar esta", "quiero comprar", "de Tom"]),
    );
    expect(labels).not.toEqual(expect.arrayContaining(["Ombre", "Leather", "Ford"]));
  });

  it("keeps existing exact concepts but does not collapse fuller emerging phrases into partial existing concepts", () => {
    const exact = evaluateCaptureInput({
      text: "Revisar Railway",
      nodes: [],
      contexts: [context({ id: "railway", name: "Railway" })],
      relations: [],
    });
    expect(exact.conceptSuggestions).toEqual([
      expect.objectContaining({
        kind: "existing",
        label: "Railway",
      }),
    ]);

    const partial = evaluateCaptureInput({
      text: "Revisar Tom Ford",
      nodes: [],
      contexts: [context({ id: "ford", name: "Ford" })],
      relations: [],
    });

    expect(partial.conceptSuggestions).toContainEqual(
      expect.objectContaining({
        kind: "emerging",
        suggestedLabel: "Tom Ford",
      }),
    );
    expect(partial.conceptSuggestions).toContainEqual(
      expect.objectContaining({
        kind: "existing",
        label: "Ford",
      }),
    );
  });

  it("limits visual suggestions and remains silent for empty or generic text", () => {
    const many = evaluateCaptureInput({
      text: "Ombre Leather, Tom Ford, Erba Pura, 212 VIP Black, Operational Core, Access Tracking y Mina Andes Norte.",
      nodes: [],
      contexts: [],
      relations: [],
    });
    expect(many.conceptSuggestions).toHaveLength(5);

    for (const text of ["", "   ", "quiero hacer esto para continuar"]) {
      const evaluation = evaluateCaptureInput({
        text,
        nodes: [],
        contexts: [],
        relations: [],
      });

      expect(evaluation.conceptSuggestions).toEqual([]);
    }
  });
});

function labelsFor(text: string) {
  return extractSemanticPhraseCandidates(text).map((candidate) => candidate.text);
}

function context(overrides: Partial<Context>): Context {
  return {
    id: "context",
    workspaceId: "workspace-1",
    type: "PROJECT",
    name: "Context",
    description: null,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}
