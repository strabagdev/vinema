import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import type { Node } from "@/domain/node/node";
import { evaluateCaptureInput } from "@/features/associations/capture-input-evaluation";
import { extractSemanticPhraseCandidates } from "@/features/semantics/semantic-phrase-extractor";
import { createContext } from "@/features/context/create-context";
import { attachNodeToContext, listNodesForContext } from "@/features/context/node-context-relations";
import { IndexedDbContextRepository } from "@/infrastructure/context/indexed-db-context-repository";
import { IndexedDbNodeContextRelationRepository } from "@/infrastructure/context/indexed-db-node-context-relation-repository";
import { IndexedDbNodeRepository } from "@/infrastructure/node/indexed-db-node-repository";
import { resetVinemaDbConnectionForTests, VINEMA_DB_NAME } from "@/infrastructure/storage/vinema-db";

const cases = [
  { text: "Daily Report", candidates: ["Daily Report"], expected: ["Daily Report"] },
  { text: "Entrenamiento guitarra", candidates: ["Entrenamiento guitarra"], expected: ["Entrenamiento guitarra"] },
  { text: "Machine Learning", candidates: ["Machine Learning"], expected: ["Machine Learning"] },
  { text: "Informe Diario", candidates: ["Informe Diario"], expected: ["Informe Diario"] },
  { text: "Project Management", candidates: ["Project Management"], expected: ["Project Management"] },
  { text: "Control Documental", candidates: ["Control Documental"], expected: ["Control Documental"] },
  { text: "Planificación Semanal", candidates: ["Planificación Semanal"], expected: ["Planificación Semanal"] },
  { text: "Proyecto solar departamento", candidates: ["Proyecto solar", "Solar departamento"], expected: ["Proyecto solar"] },
  { text: "Comprar pan", candidates: [], expected: [] },
  { text: "Enviar correo al jefe", candidates: ["Enviar correo"], expected: [] },
  { text: "Lavar ropa", candidates: ["Lavar ropa"], expected: [] },
  { text: "Llamar a Juan", candidates: ["Juan"], expected: [] },
  { text: "Ir al supermercado", candidates: ["Supermercado"], expected: [] },
  { text: "Revisar esto después", candidates: ["Esto después"], expected: [] },
];

const emptyMemory = { nodes: [], contexts: [], relations: [] };

function capture(id: string, content: string): Node {
  return {
    id, content, workspaceId: "semantic-acceptance", type: "NOTE",
    status: "ACTIVE", organizationStatus: "ORGANIZED", metadata: {}, version: 1,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null, createdByDeviceId: "device", lastModifiedByDeviceId: "device",
  };
}

function currentLabels(result: ReturnType<typeof evaluateCaptureInput>) {
  return result.conceptSuggestions
    .filter((suggestion) => suggestion.evidenceOrigin === "CURRENT_TEXT")
    .map((suggestion) => suggestion.kind === "existing" ? suggestion.label : suggestion.suggestedLabel);
}

async function clearDatabase() {
  await resetVinemaDbConnectionForTests();
  await deleteDB(VINEMA_DB_NAME);
}

afterEach(clearDatabase);

describe("semantic core acceptance contract", () => {
  it.each(cases)("audits candidates and exact CURRENT_TEXT output: $text", ({ text, candidates, expected }) => {
    expect(extractSemanticPhraseCandidates(text).map((candidate) => candidate.text)).toEqual(candidates);
    const first = evaluateCaptureInput({ text, ...emptyMemory });
    expect(currentLabels(first)).toEqual(expected);
    expect(evaluateCaptureInput({ text, ...emptyMemory }).conceptSuggestions).toEqual(first.conceptSuggestions);
    expect(first.recoveryMatches).toEqual([]);
  });

  it.each(cases)("is independent of node, concept and relation order: $text", ({ text, expected }) => {
    const nodes = [capture("one", "Nebulosa violeta"), capture("two", "Archivo remoto")];
    const contexts = ["Nebulosa violeta", "Archivo remoto"].map((name, index) => ({
      id: `context-${index}`, workspaceId: "semantic-acceptance", type: "PROJECT" as const,
      name, description: null, version: 1, archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    const relations = nodes.map((node, index) => ({
      id: `relation-${index}`, nodeId: node.id, contextId: contexts[index].id,
      workspaceId: node.workspaceId, version: 1, createdAt: node.createdAt,
    }));
    const baseline = evaluateCaptureInput({ text, nodes, contexts, relations }).conceptSuggestions;
    for (let permutation = 0; permutation < 8; permutation += 1) {
      const result = evaluateCaptureInput({
        text,
        nodes: permutation & 1 ? [...nodes].reverse() : nodes,
        contexts: permutation & 2 ? [...contexts].reverse() : contexts,
        relations: permutation & 4 ? [...relations].reverse() : relations,
      });
      expect(currentLabels(result)).toEqual(expected);
      expect(result.conceptSuggestions).toEqual(baseline);
    }
  });

  it.each(cases.filter(({ expected }) => expected.length > 0))(
    "confirms, persists and recovers the suggested concept: $text",
    async ({ text, expected }) => {
      await clearDatabase();
      const suggestion = evaluateCaptureInput({ text, ...emptyMemory }).conceptSuggestions[0];
      expect(suggestion.kind).toBe("emerging");
      if (suggestion.kind !== "emerging") throw new Error("Expected a local suggestion");
      const repositories = {
        contextRepository: new IndexedDbContextRepository(),
        nodeRepository: new IndexedDbNodeRepository(),
        nodeContextRelationRepository: new IndexedDbNodeContextRelationRepository(),
      };
      // A suggestion alone must not create a concept or association.
      expect(await repositories.contextRepository.list({ workspaceId: "semantic-acceptance" })).toEqual([]);
      expect(await repositories.nodeContextRelationRepository.listByWorkspace("semantic-acceptance")).toEqual([]);
      const node = await repositories.nodeRepository.create(capture("accepted", text));
      const concept = await createContext(repositories.contextRepository, {
        workspaceId: node.workspaceId, type: "PROJECT", name: suggestion.suggestedLabel,
      });
      await attachNodeToContext(repositories, { nodeId: node.id, contextId: concept.id });
      await resetVinemaDbConnectionForTests();
      const contexts = await new IndexedDbContextRepository().list({ workspaceId: node.workspaceId });
      const nodes = await new IndexedDbNodeRepository().listByWorkspace(node.workspaceId);
      const relations = await new IndexedDbNodeContextRelationRepository().listByWorkspace(node.workspaceId);
      expect(relations).toHaveLength(1);
      expect(relations[0]).toMatchObject({ nodeId: node.id, contextId: concept.id });
      expect((await listNodesForContext(repositories, { contextId: concept.id })).map((item) => item.id)).toEqual([node.id]);
      const recovered = evaluateCaptureInput({ text: expected[0], contexts, nodes, relations });
      expect(currentLabels(recovered)).toEqual(expected);
      expect(recovered.conceptSuggestions[0]).toMatchObject({ kind: "existing", conceptId: concept.id });
      expect(recovered.recoveryMatches.map((match) => match.node.id)).toContain(node.id);
    },
  );
});
