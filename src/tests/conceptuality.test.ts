import { describe, expect, it } from "vitest";
import { assessConceptuality } from "@/features/semantics/conceptuality";
import { extractSemanticPhraseCandidates } from "@/features/semantics/semantic-phrase-extractor";
import { evaluateCaptureInput } from "@/features/associations/capture-input-evaluation";

function assess(text: string, fragment: string) {
  const candidate = extractSemanticPhraseCandidates(text).find((item) => item.text === fragment);
  expect(candidate, fragment).toBeDefined();
  return assessConceptuality(candidate!, text);
}

describe("conceptuality assessment", () => {
  it("explains a reusable compound and an episodic instruction independently of candidate score", () => {
    const topic = assess("Gestión documental", "Gestión documental");
    const instruction = assess("Comprar detergente", "Comprar detergente");
    expect(topic.accepted).toBe(true);
    expect(topic.reasons).toContain("reusable-unit");
    expect(instruction.accepted).toBe(false);
    expect(instruction.reasons).toContain("episodic-action");
    const candidate = extractSemanticPhraseCandidates("Comprar detergente")[0];
    expect(assessConceptuality({ ...candidate, score: 1 }, "Comprar detergente")).toEqual(instruction);
  });

  it.each([
    "Comprar Detergente", "comprar detergente", "Lavar Ropa", "lavar ropa",
    "Escribirle a Pedro", "escribirle a Pedro", "Enviarles un correo", "Llamarle a Andrés",
  ])("does not let capitalization or long clitic verbs turn instructions into concepts: %s", (text) => {
    expect(evaluateCaptureInput({ text, nodes: [], contexts: [], relations: [] }).conceptSuggestions).toEqual([]);
  });

  it("keeps a reusable practice distinct from its episodic action", () => {
    expect(assess("Practicar guitarra todos los martes", "Practicar guitarra").accepted).toBe(true);
    expect(assess("Practicar guitarra", "Practicar guitarra").accepted).toBe(false);
  });

  it("preserves complete nominal topics inside an instruction", () => {
    expect(assess("Aprender fotografía analógica", "Fotografía analógica").accepted).toBe(true);
    expect(assess("Ir al supermercado", "Supermercado").reasons).toContain("episodic-action");
  });

  it("does not infer a compound concept from embedded capitalized names alone", () => {
    expect(assess("Notas sobre Ombre Leather", "Ombre Leather").accepted).toBe(false);
    expect(assess("Data Analytics", "Data Analytics").accepted).toBe(true);
  });

  it("explains weak boundaries separately from episodic actions", () => {
    expect(assess("Terminar informe mañana", "Informe mañana").reasons).toContain("circumstantial-fragment");
  });
});
