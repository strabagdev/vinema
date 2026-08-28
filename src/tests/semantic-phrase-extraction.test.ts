import { describe, expect, it } from "vitest";
import type { Context } from "@/domain/context/context";
import { evaluateCaptureInput } from "@/features/associations/capture-input-evaluation";
import { extractSemanticPhraseCandidates } from "@/features/semantics/semantic-phrase-extractor";
import { tokenizeSemanticText } from "@/features/semantics/semantic-tokenizer";

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

  it("uses visible shape as candidate input without product or domain seeds", () => {
    const labels = labelsFor(
      "Los perfumes que quiero comprar son Ombre Leather de Tom Ford y Erba Pura.",
    );

    expect(labels).toContain("Ombre Leather");
    expect(labels).toContain("Erba Pura");
    expect(labels).not.toEqual(
      expect.arrayContaining(["Ombre", "Leather", "Tom", "Ford", "Erba", "Pura"]),
    );
  });

  it("does not derive Spanish morphology concepts from current input alone", () => {
    const labels = labelsFor(
      "El operador puede detectar tardíamente a trabajadores en el área.",
    );

    expect(labels).not.toContain("Detección tardía");
  });

  it("prefers complete de-linked nominal phrases over overlapping fragments", () => {
    const labels = labelsFor("una fuente única de verdad para la operación");

    expect(labels).toContain("Fuente única de verdad");
    expect(labels).not.toContain("Fuente única");
    expect(labels).not.toContain("Única de verdad");
  });

  it("keeps de-linked concepts and rejects default y coordination as one concept", () => {
    expect(labelsFor("riesgo de atropello")).toContain("Riesgo de atropello");
    expect(labelsFor("seguridad y continuidad operacional")).not.toContain(
      "Seguridad y continuidad",
    );
  });

  it("rejects conjugated verb object fragments without blocking derived nouns", () => {
    const actionLabels = labelsFor(
      "Los módulos actualizan información automáticamente. " +
        "El sistema gestiona personas. " +
        "La herramienta mantiene registros.",
    );
    const derivedLabels = labelsFor(
      "La actualización de información mantiene la trazabilidad.",
    );

    expect(actionLabels).not.toContain("Actualizan información");
    expect(actionLabels).not.toContain("Gestiona personas");
    expect(actionLabels).not.toContain("Mantiene registros");
    expect(derivedLabels).toContain("Actualización de información");
  });

  it("rejects dependent starts and incomplete endings", () => {
    expect(
      labelsFor("El sistema funciona como clientes especializados."),
    ).not.toContain("Como clientes");
    expect(
      labelsFor("El sistema define permisos cada usuario según su contexto."),
    ).not.toContain("Permisos cada");
  });

  it("keeps existing positive semantic concept shapes", () => {
    const labels = labelsFor(
      "Fuente única de verdad. Operational Core. Continuidad operacional. " +
        "Modelo configurable. Clientes especializados. Riesgo de atropello. " +
        "Perforación de avance.",
    );

    expect(labels).toEqual(
      expect.arrayContaining([
        "Fuente única de verdad",
        "Operational Core",
        "Continuidad operacional",
        "Modelo configurable",
        "Clientes especializados",
        "Riesgo de atropello",
        "Perforación de avance",
      ]),
    );
  });

  it("keeps personal memory empty until evidence or stored concepts exist", () => {
    const evaluation = evaluateCaptureInput({
      text: "Ombre Leather, Tom Ford, Erba Pura, Operational Core y Mina Andes Norte.",
      nodes: [],
      contexts: [],
      relations: [],
    });

    expect(evaluation.conceptSuggestions).toEqual([]);
  });

  it("resolves exact stored concepts without creating fuller current-input concepts", () => {
    const exact = evaluateCaptureInput({
      text: "Revisar Railway",
      nodes: [],
      contexts: [context({ id: "railway", name: "Railway" })],
      relations: [],
    });
    const partial = evaluateCaptureInput({
      text: "Revisar Tom Ford",
      nodes: [],
      contexts: [context({ id: "ford", name: "Ford" })],
      relations: [],
    });

    expect(exact.conceptSuggestions).toContainEqual(
      expect.objectContaining({
        kind: "existing",
        label: "Railway",
      }),
    );
    expect(partial.conceptSuggestions).toContainEqual(
      expect.objectContaining({
        kind: "existing",
        label: "Ford",
      }),
    );
    expect(partial.conceptSuggestions).not.toContainEqual(
      expect.objectContaining({
        kind: "emerging",
        suggestedLabel: "Tom Ford",
      }),
    );
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
