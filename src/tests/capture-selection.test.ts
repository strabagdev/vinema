import { describe, expect, it } from "vitest";
import type { Context } from "@/domain/context/context";
import {
  createSelectionEmergingConcept,
  createValidCapturedSelection,
  resolveCapturedSelectionConcept,
} from "@/features/capture/capture-selection";

describe("capture selection", () => {
  it("accepts a compact meaningful selection", () => {
    expect(
      createValidCapturedSelection({
        text: " Mitcom ",
        start: 2,
        end: 8,
      }),
    ).toMatchObject({
      text: "Mitcom",
      normalizedText: "mitcom",
      start: 2,
      end: 8,
    });
  });

  it("rejects empty, punctuation-only, too long and extensive selections", () => {
    expect(
      createValidCapturedSelection({ text: " .?! ", start: 0, end: 4 }),
    ).toBeNull();
    expect(
      createValidCapturedSelection({ text: "a", start: 0, end: 1 }),
    ).toBeNull();
    expect(
      createValidCapturedSelection({
        text: "x".repeat(121),
        start: 0,
        end: 121,
      }),
    ).toBeNull();
    expect(
      createValidCapturedSelection({
        text: "uno\n\ndos",
        start: 0,
        end: 8,
      }),
    ).toBeNull();
  });

  it("resolves existing concepts by canonical name, alias and acronym", () => {
    const contexts = [
      createContext({ id: "mitcom", name: "Mitcom", aliases: ["Proveedor Mitcom"] }),
      createContext({ id: "andina", name: "Operacion Andina" }),
    ];

    expect(
      resolveCapturedSelectionConcept(
        createValidCapturedSelection({
          text: "mitcom",
          start: 0,
          end: 6,
        })!,
        contexts,
      ),
    ).toMatchObject({ status: "EXACT", conceptId: "mitcom" });
    expect(
      resolveCapturedSelectionConcept(
        createValidCapturedSelection({
          text: "proveedor mitcom",
          start: 0,
          end: 16,
        })!,
        contexts,
      ),
    ).toMatchObject({ status: "ALIAS", conceptId: "mitcom" });
    expect(
      resolveCapturedSelectionConcept(
        createValidCapturedSelection({
          text: "OA",
          start: 0,
          end: 2,
        })!,
        contexts,
      ),
    ).toMatchObject({ status: "ALIAS", conceptId: "andina" });
  });

  it("detects ambiguous concepts and prepares new emerging concepts", () => {
    const selection = createValidCapturedSelection({
      text: "OC",
      start: 0,
      end: 2,
    })!;
    const contexts = [
      createContext({ id: "core", name: "Operational Core", aliases: ["OC"] }),
      createContext({ id: "office", name: "Oficina Central", aliases: ["OC"] }),
    ];

    const resolution = resolveCapturedSelectionConcept(selection, contexts);

    expect(resolution.status).toBe("AMBIGUOUS");
    expect(resolution.status === "AMBIGUOUS" ? resolution.candidates : []).toHaveLength(2);
    expect(createSelectionEmergingConcept(selection)).toMatchObject({
      kind: "emerging",
      candidateId: "selection:oc",
      suggestedLabel: "OC",
      score: 1,
    });
  });

  it("normalizes only the visible label for new emerging concepts", () => {
    const selection = createValidCapturedSelection({
      text: "ESTADO DE PAGO",
      start: 0,
      end: 14,
    })!;

    expect(createSelectionEmergingConcept(selection)).toMatchObject({
      candidateId: "selection:estado de pago",
      suggestedLabel: "Estado de pago",
      representativeTerms: ["estado", "de", "pago"],
    });
  });

  it("lets an existing canonical concept win before creating a normalized label", () => {
    const selection = createValidCapturedSelection({
      text: "estado de pago",
      start: 0,
      end: 14,
    })!;
    const contexts = [
      createContext({
        id: "estado-pago",
        name: "Estado de pago",
        aliases: ["estatus pago"],
      }),
    ];

    expect(resolveCapturedSelectionConcept(selection, contexts)).toMatchObject({
      status: "EXACT",
      conceptId: "estado-pago",
      canonicalLabel: "Estado de pago",
    });
    expect(
      resolveCapturedSelectionConcept(
        createValidCapturedSelection({
          text: "ESTATUS PAGO",
          start: 0,
          end: 12,
        })!,
        contexts,
      ),
    ).toMatchObject({
      status: "ALIAS",
      conceptId: "estado-pago",
      canonicalLabel: "Estado de pago",
    });
  });
});

function createContext(overrides: Partial<Context>): Context {
  return {
    id: "context-1",
    workspaceId: "workspace-1",
    type: "AREA",
    name: "Contexto",
    description: null,
    aliases: [],
    normalizedAliases: [],
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}
