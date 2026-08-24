import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDB } from "idb";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { createMemoryEvidenceModel } from "@/features/cognition/memory-evidence/memory-evidence-model";
import { deriveKnowledgeSuggestions } from "@/features/cognition/knowledge-suggestions/knowledge-suggestion-engine";
import {
  createEmbeddingRecordId,
  SEMANTIC_EMBEDDING_DIMENSIONS,
  SEMANTIC_EMBEDDING_MODEL_ID,
  SEMANTIC_EMBEDDING_MODEL_VERSION,
  type EmbeddingRecord,
  type EmbeddingRuntime,
} from "@/features/semantic-similarity/embedding-types";
import {
  applyE5Prefix,
  captureMarkdownToEmbeddingText,
  createEmbeddingSourceHash,
} from "@/features/semantic-similarity/embedding-text";
import {
  buildConceptSemanticRepresentations,
  CONCEPT_REPRESENTATION_VERSION,
} from "@/features/semantic-similarity/concept-representation";
import { InMemoryEmbeddingRepository } from "@/features/semantic-similarity/in-memory-embedding-repository";
import { EmbeddingJobQueue } from "@/features/semantic-similarity/embedding-job-queue";
import { SemanticVectorIndex } from "@/features/semantic-similarity/semantic-vector-index";
import { SemanticSimilarityEngine } from "@/features/semantic-similarity/semantic-similarity-engine";
import { mergeSemanticAssociationSuggestions } from "@/features/semantic-similarity/semantic-association-integration";
import {
  mergeSemanticConceptSuggestions,
  SEMANTIC_CONCEPT_SUGGESTION_REASON,
} from "@/features/semantic-similarity/semantic-concept-integration";
import { IndexedDbEmbeddingRepository } from "@/infrastructure/semantic-similarity/indexed-db-embedding-repository";
import { InMemoryNodeRepository } from "@/tests/fakes/in-memory-node-repository";
import {
  VINEMA_DB_NAME,
  resetVinemaDbConnectionForTests,
} from "@/infrastructure/storage/vinema-db";

const workspaceId = "workspace-semantic";
const model = {
  modelId: SEMANTIC_EMBEDDING_MODEL_ID,
  modelVersion: SEMANTIC_EMBEDDING_MODEL_VERSION,
  dimensions: SEMANTIC_EMBEDDING_DIMENSIONS,
};

describe("semantic similarity text preparation", () => {
  it("converts markdown to plain text and applies E5 prefixes centrally", () => {
    expect(captureMarkdownToEmbeddingText("## Café\n\n**Ritual** diario")).toBe(
      "Café\nRitual diario",
    );
    expect(applyE5Prefix("  búsqueda   con   acento  ", "query")).toBe(
      "query: búsqueda con acento",
    );
    expect(applyE5Prefix("pasaje", "passage")).toBe("passage: pasaje");
  });

  it("creates deterministic source hashes from normalized text", () => {
    expect(createEmbeddingSourceHash("café   diario")).toBe(
      createEmbeddingSourceHash(" café diario "),
    );
  });
});

describe("embedding repositories", () => {
  beforeEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  afterEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  it("persists vectors in IndexedDB and restores Float32Array records", async () => {
    const repository = new IndexedDbEmbeddingRepository();
    const record = makeEmbeddingRecord({
      sourceId: "capture-1",
      sourceHash: "hash-1",
      vector: new Float32Array([1, 0, 0]),
      status: "READY",
    });

    await repository.upsert(record);

    await expect(repository.get({ id: record.id })).resolves.toMatchObject({
      sourceId: "capture-1",
      status: "READY",
    });
    expect((await repository.get({ id: record.id }))?.vector).toBeInstanceOf(
      Float32Array,
    );
  });

  it("garbage collects archived or deleted captures by active source id", async () => {
    const repository = new InMemoryEmbeddingRepository([
      makeEmbeddingRecord({ sourceId: "active" }),
      makeEmbeddingRecord({ sourceId: "archived" }),
    ]);

    await expect(
      repository.garbageCollect({
        workspaceId,
        activeSourceIds: new Set(["active"]),
      }),
    ).resolves.toBe(1);
    await expect(
      repository.getBySource({
        workspaceId,
        sourceType: "capture",
        sourceId: "archived",
      }),
    ).resolves.toBeNull();
  });

  it("stores capture and concept embeddings together and filters by source type", async () => {
    const repository = new InMemoryEmbeddingRepository([
      makeEmbeddingRecord({
        sourceId: "capture-ready",
        status: "READY",
        vector: new Float32Array([1, 0, 0]),
      }),
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "concept-ready",
        status: "READY",
        vector: new Float32Array([0, 1, 0]),
      }),
    ]);

    await expect(
      repository.listReadyByWorkspace({ ...model, workspaceId, sourceType: "capture" }),
    ).resolves.toMatchObject([{ sourceId: "capture-ready" }]);
    await expect(
      repository.listReadyByWorkspace({ ...model, workspaceId, sourceType: "concept" }),
    ).resolves.toMatchObject([{ sourceId: "concept-ready" }]);
  });

  it("garbage collects source types independently", async () => {
    const repository = new InMemoryEmbeddingRepository([
      makeEmbeddingRecord({ sourceId: "capture-active" }),
      makeEmbeddingRecord({ sourceType: "concept", sourceId: "concept-active" }),
    ]);

    await repository.garbageCollect({
      workspaceId,
      sourceType: "capture",
      activeSourceIds: new Set(["capture-active"]),
    });

    await expect(
      repository.getBySource({
        workspaceId,
        sourceType: "concept",
        sourceId: "concept-active",
      }),
    ).resolves.toMatchObject({ sourceId: "concept-active" });
  });
});

describe("concept semantic representation", () => {
  it("builds deterministic concept text from canonical name, aliases and limited evidence", () => {
    const evidenceModel = makeEvidenceModel({
      contexts: [
        makeContext({
          id: "sleep",
          name: "Sueño",
          aliases: ["Descanso"],
          normalizedAliases: ["rutina nocturna"],
        }),
      ],
      nodes: Array.from({ length: 7 }, (_, index) =>
        makeNode({
          id: `sleep-node-${index + 1}`,
          content: `Evidencia sueño ${index + 1}`,
          updatedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
        }),
      ),
      relations: Array.from({ length: 7 }, (_, index) =>
        makeRelation({
          id: `rel-${index + 1}`,
          nodeId: `sleep-node-${index + 1}`,
          contextId: "sleep",
        }),
      ),
    });

    const [representation] = buildConceptSemanticRepresentations(evidenceModel);
    const repeated = buildConceptSemanticRepresentations(evidenceModel)[0];

    expect(representation).toMatchObject({
      conceptId: "sleep",
      representationVersion: CONCEPT_REPRESENTATION_VERSION,
    });
    expect(representation.text).toContain("Nombre: Sueño");
    expect(representation.identityText).toContain("Aliases: Descanso, rutina nocturna");
    expect(representation.evidenceText).toContain("Evidencia:");
    expect(representation.evidenceNodeIds).toHaveLength(5);
    expect(representation.sourceHash).toBe(repeated.sourceHash);
  });

  it("changes source hash when aliases or representation version input changes", () => {
    const base = buildConceptSemanticRepresentations(
      makeEvidenceModel({
        contexts: [makeContext({ id: "mitcom", name: "Mitcom" })],
        nodes: [makeNode({ id: "node-1", content: "control proveedor" })],
        relations: [makeRelation({ nodeId: "node-1", contextId: "mitcom" })],
      }),
    )[0];
    const withAlias = buildConceptSemanticRepresentations(
      makeEvidenceModel({
        contexts: [
          makeContext({ id: "mitcom", name: "Mitcom", aliases: ["Proveedor"] }),
        ],
        nodes: [makeNode({ id: "node-1", content: "control proveedor" })],
        relations: [makeRelation({ nodeId: "node-1", contextId: "mitcom" })],
      }),
    )[0];

    expect(base.sourceHash).not.toBe(withAlias.sourceHash);
    expect(base.sourceHash).toBe(
      createEmbeddingSourceHash(
        [
          `concept-representation-v${CONCEPT_REPRESENTATION_VERSION}`,
          base.identityText,
          base.evidenceText,
        ].join("\n"),
      ),
    );
  });
});

describe("embedding job queue", () => {
  it("backfills active captures and excludes archived captures", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      makeNode({ id: "active", content: "nota activa" }),
      makeNode({
        id: "archived",
        content: "nota olvidada",
        archivedAt: "2026-01-02T00:00:00.000Z",
        status: "ARCHIVED",
      }),
    ]);
    const repository = new InMemoryEmbeddingRepository();
    const runtime = makeRuntime();
    const queue = new EmbeddingJobQueue({ repository, nodeRepository, runtime });

    await queue.backfillWorkspace(workspaceId);

    await expect(
      repository.getBySource({ workspaceId, sourceType: "capture", sourceId: "active" }),
    ).resolves.toMatchObject({ status: "READY" });
    await expect(
      repository.getBySource({ workspaceId, sourceType: "capture", sourceId: "archived" }),
    ).resolves.toBeNull();
  });

  it("discards stale processing results when the source changes", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      makeNode({ id: "capture-1", content: "texto inicial" }),
    ]);
    const repository = new InMemoryEmbeddingRepository();
    const runtime = makeRuntime({
      embed: async () => {
        await nodeRepository.update(
          makeNode({ id: "capture-1", content: "texto actualizado" }),
        );
        return new Float32Array([1, 0, 0]);
      },
    });
    const queue = new EmbeddingJobQueue({ repository, nodeRepository, runtime });

    await queue.backfillWorkspace(workspaceId);

    await expect(
      repository.getBySource({
        workspaceId,
        sourceType: "capture",
        sourceId: "capture-1",
      }),
    ).resolves.toMatchObject({
      status: "PENDING",
      sourceHash: createEmbeddingSourceHash("texto actualizado"),
      vector: null,
    });
  });

  it("keeps failed embeddings local and retries without blocking capture writes", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      makeNode({ id: "capture-1", content: "modo offline" }),
    ]);
    const repository = new InMemoryEmbeddingRepository();
    const runtime = makeRuntime({
      embed: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const queue = new EmbeddingJobQueue({ repository, nodeRepository, runtime });

    await queue.backfillWorkspace(workspaceId);

    await expect(
      repository.getBySource({
        workspaceId,
        sourceType: "capture",
        sourceId: "capture-1",
      }),
    ).resolves.toMatchObject({
      status: "PENDING",
      lastErrorMessage: "offline",
    });
  });

  it("backfills concept embeddings from MemoryEvidenceModel", async () => {
    const nodeRepository = new InMemoryNodeRepository();
    const repository = new InMemoryEmbeddingRepository();
    const queue = new EmbeddingJobQueue({
      repository,
      nodeRepository,
      runtime: makeRuntime({ vector: new Float32Array([0, 1, 0]) }),
    });
    const evidenceModel = makeEvidenceModel({
      contexts: [makeContext({ id: "concept-1", name: "Respiración" })],
      nodes: [makeNode({ id: "node-1", content: "respirar antes de dormir" })],
      relations: [makeRelation({ nodeId: "node-1", contextId: "concept-1" })],
    });

    await queue.backfillConceptsFromEvidenceModel(workspaceId, evidenceModel);

    await expect(
      repository.getBySource({
        workspaceId,
        sourceType: "concept",
        sourceId: "concept-1",
      }),
    ).resolves.toMatchObject({
      status: "READY",
      sourceType: "concept",
    });
  });

  it("invalidates concept embedding when representative evidence changes", async () => {
    const nodeRepository = new InMemoryNodeRepository();
    const repository = new InMemoryEmbeddingRepository();
    const queue = new EmbeddingJobQueue({
      repository,
      nodeRepository,
      runtime: makeRuntime({ vector: new Float32Array([0, 1, 0]) }),
    });
    const initial = makeEvidenceModel({
      contexts: [makeContext({ id: "concept-1", name: "Respiración" })],
      nodes: [makeNode({ id: "node-1", content: "respirar antes de dormir" })],
      relations: [makeRelation({ nodeId: "node-1", contextId: "concept-1" })],
    });
    const changed = makeEvidenceModel({
      contexts: [makeContext({ id: "concept-1", name: "Respiración" })],
      nodes: [makeNode({ id: "node-2", content: "respirar luego de caminar" })],
      relations: [makeRelation({ nodeId: "node-2", contextId: "concept-1" })],
    });

    await queue.backfillConceptsFromEvidenceModel(workspaceId, initial);
    const first = await repository.getBySource({
      workspaceId,
      sourceType: "concept",
      sourceId: "concept-1",
    });
    await queue.backfillConceptsFromEvidenceModel(workspaceId, changed);
    const second = await repository.getBySource({
      workspaceId,
      sourceType: "concept",
      sourceId: "concept-1",
    });

    expect(first?.sourceHash).not.toBe(second?.sourceHash);
  });
});

describe("semantic vector index and engine", () => {
  it("returns nearest neighbors using normalized dot similarity and excludes self", () => {
    const index = new SemanticVectorIndex([
      { id: "self", vector: new Float32Array([1, 0]) },
      { id: "near", vector: new Float32Array([0.9, 0.1]) },
      { id: "far", vector: new Float32Array([0, 1]) },
    ]);

    const matches = index.search({
      vector: new Float32Array([1, 0]),
      topK: 2,
      excludeIds: new Set(["self"]),
    });

    expect(matches[0]).toMatchObject({ id: "near", rank: 1 });
    expect(
      index.search({
        vector: new Float32Array([1, 0]),
        topK: 1,
        excludeIds: new Set(["self"]),
      }),
    ).toMatchObject([{ id: "near", rank: 1 }]);
  });

  it("finds local capture matches and does not surface archived captures", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      makeNode({ id: "ready", content: "rutina de sueño" }),
      makeNode({
        id: "archived",
        content: "rutina archivada",
        archivedAt: "2026-01-02T00:00:00.000Z",
        status: "ARCHIVED",
      }),
    ]);
    const repository = new InMemoryEmbeddingRepository([
      makeEmbeddingRecord({
        sourceId: "ready",
        vector: new Float32Array([1, 0, 0]),
        status: "READY",
      }),
      makeEmbeddingRecord({
        sourceId: "archived",
        vector: new Float32Array([1, 0, 0]),
        status: "READY",
      }),
    ]);
    const engine = new SemanticSimilarityEngine({
      repository,
      nodeRepository,
      runtime: makeRuntime({ vector: new Float32Array([1, 0, 0]) }),
    });

    await expect(
      engine.findSimilarCaptures({ workspaceId, text: "descanso", topK: 5 }),
    ).resolves.toMatchObject([{ node: { id: "ready" } }]);
  });

  it("filters capture search to capture source embeddings", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      makeNode({ id: "ready", content: "rutina de sueño" }),
    ]);
    const repository = new InMemoryEmbeddingRepository([
      makeEmbeddingRecord({
        sourceId: "ready",
        sourceType: "capture",
        vector: new Float32Array([1, 0, 0]),
        status: "READY",
      }),
      makeEmbeddingRecord({
        sourceId: "ready",
        sourceType: "concept",
        vector: new Float32Array([0, 1, 0]),
        status: "READY",
      }),
    ]);
    const engine = new SemanticSimilarityEngine({
      repository,
      nodeRepository,
      runtime: makeRuntime({ vector: new Float32Array([0, 1, 0]) }),
    });

    await expect(
      engine.findSimilarCaptures({ workspaceId, text: "descanso", topK: 5 }),
    ).resolves.toEqual([]);
  });

  it("embeds each manual query with the current text", async () => {
    const embeddedTexts: string[] = [];
    const nodeRepository = new InMemoryNodeRepository([
      makeNode({ id: "ready", content: "rutina de sueño" }),
    ]);
    const repository = new InMemoryEmbeddingRepository([
      makeEmbeddingRecord({
        sourceId: "ready",
        vector: new Float32Array([1, 0, 0]),
        status: "READY",
      }),
    ]);
    const engine = new SemanticSimilarityEngine({
      repository,
      nodeRepository,
      runtime: makeRuntime({
        embed: async (text) => {
          embeddedTexts.push(text);
          return new Float32Array([1, 0, 0]);
        },
      }),
    });

    await engine.findSimilarCaptures({
      workspaceId,
      text: "vinema",
      policy: "search",
    });
    await engine.findSimilarCaptures({
      workspaceId,
      text: "codelco",
      policy: "search",
    });

    expect(embeddedTexts).toEqual(["vinema", "codelco"]);
  });

  it("keeps discovery broader than search for vector neighbors", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      makeNode({ id: "broad-neighbor", content: "rutina distante" }),
    ]);
    const repository = new InMemoryEmbeddingRepository([
      makeEmbeddingRecord({
        sourceId: "broad-neighbor",
        vector: new Float32Array([0.5, 0, 0]),
        status: "READY",
      }),
    ]);
    const engine = new SemanticSimilarityEngine({
      repository,
      nodeRepository,
      runtime: makeRuntime({ vector: new Float32Array([1, 0, 0]) }),
    });

    await expect(
      engine.findSimilarCaptures({
        workspaceId,
        text: "descanso",
        topK: 5,
        policy: "search",
      }),
    ).resolves.toEqual([]);
    await expect(
      engine.findSimilarCaptures({
        workspaceId,
        text: "descanso",
        topK: 5,
        policy: "discovery",
      }),
    ).resolves.toMatchObject([{ node: { id: "broad-neighbor" } }]);
  });

  it("finds capture-to-concept matches and excludes explicit or selected concepts", async () => {
    const evidenceModel = makeEvidenceModel({
      contexts: [
        makeContext({ id: "sleep", name: "Sueño" }),
        makeContext({ id: "work", name: "Trabajo" }),
      ],
      nodes: [
        makeNode({ id: "sleep-node", content: "descanso nocturno" }),
        makeNode({ id: "work-node", content: "reunión operativa" }),
      ],
      relations: [
        makeRelation({ nodeId: "sleep-node", contextId: "sleep" }),
        makeRelation({ nodeId: "work-node", contextId: "work" }),
      ],
    });
    const repository = new InMemoryEmbeddingRepository([
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "sleep",
        status: "READY",
        vector: new Float32Array([1, 0, 0]),
      }),
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "work",
        status: "READY",
        vector: new Float32Array([0, 1, 0]),
      }),
    ]);
    const engine = new SemanticSimilarityEngine({
      repository,
      nodeRepository: new InMemoryNodeRepository(),
      runtime: makeRuntime({ vector: new Float32Array([1, 0, 0]) }),
    });

    await expect(
      engine.findSimilarConceptsForCapture({
        workspaceId,
        text: "quiero dormir mejor",
        evidenceModel,
        excludeConceptIds: new Set(["work"]),
      }),
    ).resolves.toMatchObject([
      {
        concept: { id: "sleep" },
        evidence: { sourceType: "capture", targetType: "concept" },
      },
    ]);
  });

  it("finds concept-to-concept neighbors and excludes self without persisting relationships", async () => {
    const evidenceModel = makeEvidenceModel({
      contexts: [
        makeContext({ id: "sleep", name: "Sueño" }),
        makeContext({ id: "rest", name: "Descanso" }),
      ],
      nodes: [
        makeNode({ id: "sleep-node", content: "dormir profundo" }),
        makeNode({ id: "rest-node", content: "pausa reparadora" }),
      ],
      relations: [
        makeRelation({ nodeId: "sleep-node", contextId: "sleep" }),
        makeRelation({ nodeId: "rest-node", contextId: "rest" }),
      ],
    });
    const repository = new InMemoryEmbeddingRepository([
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "sleep",
        status: "READY",
        vector: new Float32Array([1, 0, 0]),
      }),
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "rest",
        status: "READY",
        vector: new Float32Array([0.9, 0.1, 0]),
      }),
    ]);
    const engine = new SemanticSimilarityEngine({
      repository,
      nodeRepository: new InMemoryNodeRepository(),
      runtime: makeRuntime({ vector: new Float32Array([1, 0, 0]) }),
    });

    const matches = await engine.findSimilarConceptsForConcept({
      workspaceId,
      conceptId: "sleep",
      evidenceModel,
    });

    expect(matches).toMatchObject([
      {
        concept: { id: "rest" },
        evidence: { sourceType: "concept", targetType: "concept" },
      },
    ]);
    expect(matches.map((match) => match.concept.id)).not.toContain("sleep");
  });

  it("does not let shared evidence give weak concept identities nearly equivalent semantic scores", async () => {
    const evidenceModel = makeEvidenceModel({
      contexts: [
        makeContext({ id: "aligned-a", name: "Área de maniobra" }),
        makeContext({ id: "aligned-b", name: "Baja visibilidad" }),
        makeContext({ id: "weak-shared", name: "Perforación de avance" }),
        makeContext({ id: "pure-semantic", name: "Detección operacional" }),
      ],
      nodes: [
        makeNode({
          id: "shared-node",
          content:
            "Una mala iluminación dificulta identificar personas en el frente de trabajo.",
        }),
        makeNode({
          id: "semantic-node",
          content: "El operador detecta trabajadores en zonas con baja visibilidad.",
        }),
      ],
      relations: [
        makeRelation({ nodeId: "shared-node", contextId: "aligned-a" }),
        makeRelation({ nodeId: "shared-node", contextId: "aligned-b" }),
        makeRelation({ nodeId: "shared-node", contextId: "weak-shared" }),
        makeRelation({ nodeId: "semantic-node", contextId: "pure-semantic" }),
      ],
    });
    const repository = new InMemoryEmbeddingRepository([
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "aligned-a",
        status: "READY",
        vector: new Float32Array([0.9, 0.44]),
      }),
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "aligned-b",
        status: "READY",
        vector: new Float32Array([0.88, 0.48]),
      }),
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "weak-shared",
        status: "READY",
        vector: new Float32Array([0.52, 0.85]),
      }),
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "pure-semantic",
        status: "READY",
        vector: new Float32Array([0.9, 0.43]),
      }),
    ]);
    const runtime = makeRuntime({
      embed: async (text) => {
        if (text.includes("shared-node")) {
          return new Float32Array([1, 0]);
        }

        return new Float32Array([1, 0]);
      },
    });
    const engine = new SemanticSimilarityEngine({
      repository,
      nodeRepository: new InMemoryNodeRepository(),
      runtime,
    });

    const matches = await engine.findSimilarConceptsForCapture({
      workspaceId,
      text: "baja visibilidad en área de maniobra",
      evidenceModel,
      topK: 4,
    });
    const ids = matches.map((match) => match.concept.id);

    expect(ids).toEqual(
      expect.arrayContaining(["aligned-a", "aligned-b", "pure-semantic"]),
    );
    expect(ids).not.toContain("weak-shared");
    expect(
      matches.find((match) => match.concept.id === "pure-semantic"),
    ).toBeDefined();
  });

  it("penalizes vector concept drag from evidence shared with stronger local concepts", async () => {
    const capture1 =
      "Durante la perforación de avance, una mala iluminación puede dificultar la identificación de personas u obstáculos en el frente de trabajo.";
    const capture2 =
      "Los equipos móviles presentan mayor riesgo de atropello cuando existen personas circulando dentro de su radio de operación.";
    const capture3 =
      "En sectores con baja visibilidad, el operador puede detectar tardíamente a trabajadores que ingresan al área de maniobra del equipo.";
    const capture4 =
      "La segregación mediante barreras físicas disminuye la exposición de peatones a equipos móviles durante las maniobras.";
    const evidenceModel = makeEvidenceModel({
      contexts: [
        makeContext({ id: "identificacion-personas", name: "Identificación de personas" }),
        makeContext({ id: "mala-iluminacion", name: "Mala iluminación" }),
        makeContext({ id: "perforacion-avance", name: "Perforación de avance" }),
        makeContext({ id: "equipos-moviles", name: "Equipos móviles" }),
        makeContext({ id: "radio-operacion", name: "Radio de operación" }),
        makeContext({ id: "riesgo-atropello", name: "Riesgo de atropello" }),
        makeContext({ id: "area-maniobra", name: "Área de maniobra" }),
        makeContext({ id: "baja-visibilidad", name: "Baja visibilidad" }),
        makeContext({ id: "maniobra-equipo", name: "Maniobra del equipo" }),
        makeContext({ id: "deteccion-tardia", name: "Detección tardía" }),
      ],
      nodes: [
        makeNode({ id: "capture-1", content: capture1 }),
        makeNode({ id: "capture-2", content: capture2 }),
        makeNode({ id: "capture-3", content: capture3 }),
      ],
      relations: [
        ...[
          "identificacion-personas",
          "mala-iluminacion",
          "perforacion-avance",
        ].map((contextId) =>
          makeRelation({ nodeId: "capture-1", contextId }),
        ),
        ...[
          "equipos-moviles",
          "radio-operacion",
          "riesgo-atropello",
        ].map((contextId) =>
          makeRelation({ nodeId: "capture-2", contextId }),
        ),
        ...[
          "area-maniobra",
          "baja-visibilidad",
          "maniobra-equipo",
          "deteccion-tardia",
          "identificacion-personas",
          "mala-iluminacion",
        ].map((contextId) =>
          makeRelation({ nodeId: "capture-3", contextId }),
        ),
      ],
    });
    const repository = new InMemoryEmbeddingRepository([
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "area-maniobra",
        status: "READY",
        vector: new Float32Array([0.86, 0]),
      }),
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "maniobra-equipo",
        status: "READY",
        vector: new Float32Array([0.85, 0]),
      }),
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "equipos-moviles",
        status: "READY",
        vector: new Float32Array([0.84, 0]),
      }),
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "baja-visibilidad",
        status: "READY",
        vector: new Float32Array([0.82, 0]),
      }),
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "identificacion-personas",
        status: "READY",
        vector: new Float32Array([0.81, 0]),
      }),
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "mala-iluminacion",
        status: "READY",
        vector: new Float32Array([0.8, 0]),
      }),
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "perforacion-avance",
        status: "READY",
        vector: new Float32Array([0.79, 0]),
      }),
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "radio-operacion",
        status: "READY",
        vector: new Float32Array([0.78, 0]),
      }),
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "riesgo-atropello",
        status: "READY",
        vector: new Float32Array([0.77, 0]),
      }),
      makeEmbeddingRecord({
        sourceType: "concept",
        sourceId: "deteccion-tardia",
        status: "READY",
        vector: new Float32Array([0.76, 0]),
      }),
    ]);
    const engine = new SemanticSimilarityEngine({
      repository,
      nodeRepository: new InMemoryNodeRepository(),
      runtime: makeRuntime({
        embed: async () => new Float32Array([1, 0]),
      }),
    });

    const matches = await engine.findSimilarConceptsForCapture({
      workspaceId,
      text: capture4,
      evidenceModel,
      excludeConceptIds: new Set([
        "area-maniobra",
        "maniobra-equipo",
        "equipos-moviles",
      ]),
      topK: 8,
    });
    const ids = matches.map((match) => match.concept.id);

    expect(ids).toContain("identificacion-personas");
    expect(ids).not.toContain("baja-visibilidad");
    expect(ids).not.toContain("mala-iluminacion");
    expect(ids).not.toContain("perforacion-avance");
    expect(ids).not.toContain("radio-operacion");
    expect(ids).not.toContain("riesgo-atropello");
    expect(ids).not.toContain("deteccion-tardia");
  });

  it("adds semantic matches to recovery suggestions without replacing literals", () => {
    const semanticNode = makeNode({ id: "semantic", content: "viaje a Valparaíso" });
    const results = mergeSemanticAssociationSuggestions(
      [
        {
          node: makeNode({ id: "literal", content: "plan literal" }),
          score: 0.8,
          excerpt: "plan literal",
          reasons: [{ type: "TERM_MATCH", terms: ["plan"] }],
        },
      ],
      [
        {
          node: semanticNode,
          evidence: {
            source: "LOCAL_EMBEDDING",
            sourceType: "capture",
            targetType: "capture",
            modelId: model.modelId,
            modelVersion: model.modelVersion,
            dimensions: model.dimensions,
            similarity: 0.74,
            rank: 1,
            marginToNext: null,
          },
        },
      ],
      5,
    );

    expect(results.map((result) => result.node.id)).toContain("literal");
    expect(results.map((result) => result.node.id)).toContain("semantic");
    expect(results.find((result) => result.node.id === "semantic")?.reasons).toEqual([
      expect.objectContaining({ type: "VECTOR_SIMILARITY" }),
    ]);
  });

  it("deduplicates semantic recovery matches by full normalized content before limiting", () => {
    const duplicateSemanticNode = makeNode({
      id: "duplicate-semantic",
      content:
        "## Revisar los cruces\n\ndonde interactúa personal con equipos móviles.",
      updatedAt: "2026-08-22T13:10:00.000Z",
    });
    const usefulSemanticNode = makeNode({
      id: "useful-semantic",
      content: "Evaluar barreras físicas para peatones cerca de equipos móviles.",
    });
    const results = mergeSemanticAssociationSuggestions(
      [
        {
          node: makeNode({
            id: "duplicate-literal",
            content:
              "Revisar los cruces donde interactúa personal con equipos móviles",
            updatedAt: "2026-08-22T12:21:00.000Z",
          }),
          score: 0.3,
          excerpt: "Revisar los cruces",
          reasons: [{ type: "TERM_MATCH", terms: ["revisar"] }],
        },
      ],
      [
        {
          node: duplicateSemanticNode,
          evidence: makeSimilarityEvidence({ similarity: 0.9, rank: 1 }),
        },
        {
          node: usefulSemanticNode,
          evidence: makeSimilarityEvidence({ similarity: 0.82, rank: 2 }),
        },
      ],
      2,
    );

    expect(results.map((result) => result.node.id)).toEqual([
      "duplicate-semantic",
      "useful-semantic",
    ]);
  });

  it("does not fill memory suggestion slots with weak same-domain semantic neighbors", () => {
    const localText =
      "Durante la perforación de avance, el control del polvo requiere humectación continua y ventilación suficiente. La exposición a sílice respirable aumenta cuando el material se perfora en seco o la extracción de aire es insuficiente.";
    const results = mergeSemanticAssociationSuggestions(
      [
        {
          node: makeNode({
            id: "perforacion",
            content:
              "Durante la perforación de avance, una mala iluminación puede dificultar la identificación de personas u obstáculos en el frente de trabajo.",
          }),
          score: 0.14,
          excerpt: "Durante la perforación de avance",
          reasons: [{ type: "PHRASE_MATCH", phrases: ["perfor avance"] }],
        },
      ],
      [
        {
          node: makeNode({
            id: "equipos",
            content:
              "Los equipos móviles presentan mayor riesgo de atropello dentro del radio de operación.",
          }),
          evidence: makeSimilarityEvidence({ similarity: 0.5, rank: 1 }),
        },
        {
          node: makeNode({
            id: "segregacion",
            content:
              "La segregación mediante barreras físicas disminuye la exposición de peatones a equipos móviles durante las maniobras.",
          }),
          evidence: makeSimilarityEvidence({ similarity: 0.55, rank: 2 }),
        },
      ],
      5,
      localText,
    );

    expect(results.map((result) => result.node.id)).toEqual(["perforacion"]);
  });

  it("does not let high vector similarity create memory eligibility without local anchors", () => {
    const localText =
      "Durante la perforación de avance, el control del polvo requiere humectación continua y ventilación suficiente. La exposición a sílice respirable aumenta cuando el material se perfora en seco.";
    const results = mergeSemanticAssociationSuggestions(
      [],
      [
        {
          node: makeNode({
            id: "radio-operacion",
            content:
              "El radio de operación aumenta cuando se revisan equipos móviles.",
          }),
          evidence: makeSimilarityEvidence({ similarity: 0.81, rank: 1 }),
        },
        {
          node: makeNode({
            id: "maniobra-retroceso",
            content:
              "La maniobra en retroceso requiere señalización visual del operador.",
          }),
          evidence: makeSimilarityEvidence({ similarity: 0.808, rank: 2 }),
        },
        {
          node: makeNode({
            id: "revision-cruces",
            content:
              "Revisar los cruces donde interactúan peatones y equipos móviles.",
          }),
          evidence: makeSimilarityEvidence({ similarity: 0.804, rank: 3 }),
        },
      ],
      5,
      localText,
    );

    expect(results).toEqual([]);
  });

  it("does not let isolated generic verbs create semantic memory eligibility", () => {
    const localText =
      "Durante las últimas semanas me cuesta conciliar el sueño cuando uso el teléfono justo antes de acostarme. Dejar la pantalla una hora antes y mantener un horario regular parece mejorar mi descanso al día siguiente.";
    const results = mergeSemanticAssociationSuggestions(
      [],
      [
        {
          node: makeNode({
            id: "cruces-senalizacion",
            content:
              "Mantener señalización clara en cruces donde interactúan peatones y equipos móviles.",
          }),
          evidence: makeSimilarityEvidence({ similarity: 0.91, rank: 1 }),
        },
        {
          node: makeNode({
            id: "interaccion-equipos",
            content:
              "Mantener distancia operacional entre trabajadores y equipos móviles durante la circulación.",
          }),
          evidence: makeSimilarityEvidence({ similarity: 0.9, rank: 2 }),
        },
      ],
      5,
      localText,
    );

    expect(results).toEqual([]);
  });

  it("keeps semantic memory eligibility when a generic verb shares its object", () => {
    const localText = "Mantener horario regular mejora la planificación semanal.";
    const results = mergeSemanticAssociationSuggestions(
      [],
      [
        {
          node: makeNode({
            id: "horario",
            content:
              "Mantener horario regular ayuda a ordenar la rutina diaria.",
          }),
          evidence: makeSimilarityEvidence({ similarity: 0.91, rank: 1 }),
        },
        {
          node: makeNode({
            id: "senalizacion",
            content:
              "Mantener señalización clara en cruces operacionales.",
          }),
          evidence: makeSimilarityEvidence({ similarity: 0.92, rank: 2 }),
        },
      ],
      5,
      localText,
    );

    expect(results.map((result) => result.node.id)).toEqual(["horario"]);
  });

  it("keeps only anchored memories across non-mining domains", () => {
    const scenarios = [
      {
        localText:
          "El dolor cervical aumenta cuando el paciente suspende los ejercicios.",
        anchored: "El seguimiento del dolor cervical mejora con ejercicios diarios.",
        unanchored:
          "El cliente aumenta la frecuencia de reuniones comerciales.",
      },
      {
        localText:
          "La caché reduce la latencia de consultas frecuentes en la API.",
        anchored: "La caché compartida mejora la latencia de consultas.",
        unanchored:
          "El despliegue aumenta cuando se revisa la configuración visual.",
      },
      {
        localText:
          "La planificación semanal mejora la alimentación durante jornadas largas.",
        anchored:
          "La alimentación semanal requiere planificación de colaciones.",
        unanchored:
          "El control presupuestario aumenta con revisión de gastos.",
      },
      {
        localText:
          "Los estudiantes mejoran el rendimiento cuando repasan con práctica espaciada.",
        anchored:
          "La práctica espaciada mejora el rendimiento de estudiantes.",
        unanchored:
          "El usuario aumenta el uso de notificaciones en la aplicación.",
      },
    ];

    for (const [index, scenario] of scenarios.entries()) {
      const results = mergeSemanticAssociationSuggestions(
        [],
        [
          {
            node: makeNode({
              id: `anchored-${index}`,
              content: scenario.anchored,
            }),
            evidence: makeSimilarityEvidence({ similarity: 0.9, rank: 1 }),
          },
          {
            node: makeNode({
              id: `unanchored-${index}`,
              content: scenario.unanchored,
            }),
            evidence: makeSimilarityEvidence({ similarity: 0.93, rank: 2 }),
          },
        ],
        5,
        scenario.localText,
      );

      expect(results.map((result) => result.node.id)).toEqual([
        `anchored-${index}`,
      ]);
    }
  });

  it("keeps discovery able to suggest pure semantic capture neighbors", () => {
    const semanticNode = makeNode({ id: "semantic", content: "viaje a Valparaíso" });
    const results = mergeSemanticAssociationSuggestions(
      [],
      [
        {
          node: semanticNode,
          evidence: {
            source: "LOCAL_EMBEDDING",
            sourceType: "capture",
            targetType: "capture",
            modelId: model.modelId,
            modelVersion: model.modelVersion,
            dimensions: model.dimensions,
            similarity: 0.74,
            rank: 1,
            marginToNext: null,
          },
        },
      ],
      5,
    );

    expect(results).toMatchObject([
      {
        node: { id: "semantic" },
        reasons: [expect.objectContaining({ type: "VECTOR_SIMILARITY" })],
      },
    ]);
  });

  it("requires local identity support before merging semantic concept suggestions", () => {
    const localText =
      "Durante la perforación de avance, el control del polvo requiere humectación continua y ventilación suficiente. La exposición a sílice respirable aumenta cuando el material se perfora en seco.";
    const results = mergeSemanticConceptSuggestions({
      existing: [],
      semanticMatches: [
        {
          concept: makeContext({ id: "equipos", name: "Equipos móviles" }),
          representationText: "Nombre: Equipos móviles",
          identityText: "Nombre: Equipos móviles",
          evidenceText: "",
          evidenceNodeIds: ["equipos-node"],
          conceptSimilarity: 0.7,
          evidenceSimilarity: null,
          evidence: makeSimilarityEvidence({ similarity: 0.5, rank: 1 }),
        },
        {
          concept: makeContext({
            id: "perforacion",
            name: "Perforación de avance",
          }),
          representationText: "Nombre: Perforación de avance",
          identityText: "Nombre: Perforación de avance",
          evidenceText: "",
          evidenceNodeIds: ["perforacion-node"],
          conceptSimilarity: 0.72,
          evidenceSimilarity: null,
          evidence: makeSimilarityEvidence({ similarity: 0.52, rank: 2 }),
        },
      ],
      limit: 8,
      localText,
    });

    expect(
      results.map((suggestion) =>
        suggestion.kind === "existing" ? suggestion.label : suggestion.suggestedLabel,
      ),
    ).toEqual(["Perforación de avance"]);
  });

  it("adds pure semantic concept suggestions as explained RELATED_NOW suggestions", () => {
    const context = makeContext({ id: "sleep", name: "Sueño" });
    const results = mergeSemanticConceptSuggestions({
      existing: [],
      semanticMatches: [
        {
          concept: context,
          representationText: "Nombre: Sueño",
          identityText: "Nombre: Sueño",
          evidenceText: "Evidencia:\n- dormir mejor",
          evidenceNodeIds: ["node-1"],
          conceptSimilarity: 0.72,
          evidenceSimilarity: 0.6,
          evidence: {
            source: "LOCAL_EMBEDDING",
            sourceType: "capture",
            targetType: "concept",
            modelId: model.modelId,
            modelVersion: model.modelVersion,
            dimensions: model.dimensions,
            similarity: 0.72,
            rank: 1,
            marginToNext: null,
          },
        },
      ],
      limit: 8,
    });

    expect(results).toMatchObject([
      {
        kind: "existing",
        conceptId: "sleep",
        knowledgeSuggestionKind: "RELATED_NOW",
        knowledgeSuggestionReasons: [SEMANTIC_CONCEPT_SUGGESTION_REASON],
        suggestionSource: "VECTOR_SIMILARITY",
      },
    ]);
  });

  it("lets vector similarity feed RELATED_NOW but not MISSING_CONTEXT", () => {
    const suggestions = deriveKnowledgeSuggestions({
      inputConceptIds: ["present"],
      semanticRelatedConceptIds: ["semantic"],
      contexts: [
        makeContext({ id: "present", name: "Presente" }),
        makeContext({ id: "semantic", name: "Semántico" }),
      ],
      nodes: [
        makeNode({ id: "present-node", content: "presente" }),
        makeNode({ id: "semantic-node", content: "semántico" }),
      ],
      relations: [
        makeRelation({ nodeId: "present-node", contextId: "present" }),
        makeRelation({ nodeId: "semantic-node", contextId: "semantic" }),
      ],
    });

    expect(suggestions).toContainEqual(
      expect.objectContaining({
        conceptId: "semantic",
        kind: "RELATED_NOW",
        reasons: [SEMANTIC_CONCEPT_SUGGESTION_REASON],
      }),
    );
    expect(suggestions).not.toContainEqual(
      expect.objectContaining({ conceptId: "semantic", kind: "MISSING_CONTEXT" }),
    );
  });
});

function makeRuntime(
  overrides: Partial<EmbeddingRuntime> & {
    vector?: Float32Array;
    embed?: EmbeddingRuntime["embed"];
  } = {},
): EmbeddingRuntime {
  return {
    metadata: model,
    embed:
      overrides.embed ??
      (async () => overrides.vector ?? new Float32Array([1, 0, 0])),
  };
}

function makeEmbeddingRecord(
  overrides: Partial<EmbeddingRecord> = {},
) {
  return {
    ...baseEmbeddingRecord(
      overrides.sourceId ?? "capture-1",
      overrides.sourceType ?? "capture",
    ),
    ...overrides,
  };
}

function baseEmbeddingRecord(
  sourceId: string,
  sourceType: EmbeddingRecord["sourceType"],
): EmbeddingRecord {
  return {
    id: createEmbeddingRecordId({
      workspaceId,
      sourceType,
      sourceId,
      ...model,
    }),
    workspaceId,
    sourceType,
    sourceId,
    sourceHash: "hash",
    ...model,
    status: "PENDING" as const,
    vector: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    attempts: 0,
  };
}

function makeSimilarityEvidence({
  similarity,
  rank,
}: {
  similarity: number;
  rank: number;
}) {
  return {
    source: "LOCAL_EMBEDDING" as const,
    sourceType: "capture" as const,
    targetType: "capture" as const,
    modelId: model.modelId,
    modelVersion: model.modelVersion,
    dimensions: model.dimensions,
    similarity,
    rank,
    marginToNext: null,
  };
}

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: overrides.id ?? "node-1",
    workspaceId,
    type: "NOTE",
    content: "contenido",
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    createdByDeviceId: "device-1",
    lastModifiedByDeviceId: "device-1",
    ...overrides,
  };
}

function makeContext(overrides: Partial<Context> = {}): Context {
  return {
    id: overrides.id ?? "concept-1",
    workspaceId,
    type: "AREA",
    name: "Concepto",
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

function makeRelation(
  overrides: Partial<NodeContextRelation> = {},
): NodeContextRelation {
  return {
    id: overrides.id ?? `${overrides.nodeId ?? "node-1"}:${overrides.contextId ?? "concept-1"}`,
    workspaceId,
    nodeId: "node-1",
    contextId: "concept-1",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeEvidenceModel({
  contexts,
  nodes,
  relations,
}: {
  contexts: Context[];
  nodes: Node[];
  relations: NodeContextRelation[];
}) {
  return createMemoryEvidenceModel({
    contexts,
    nodes,
    relations,
    now: new Date("2026-02-01T00:00:00.000Z"),
    recentWindowDays: 30,
  });
}
