import { describe, expect, it } from "vitest";
import type { Capture } from "@/domain/capture/capture";
import type { Concept } from "@/domain/concept/concept";
import type { CaptureConceptRelation } from "@/domain/concept/capture-concept-relation";
import type { Workspace } from "@/domain/workspace/workspace";
import { PENDING_TERMINOLOGY_ALIASES } from "@/domain/terminology-aliases";
import {
  buildAssociationIndex,
  suggestAssociations,
} from "@/features/associations/association-engine";
import { evaluateCaptureInput } from "@/features/associations/capture-input-evaluation";
import { deriveBehavioralPatterns } from "@/features/cognition/behavioral-engine/behavioral-engine";
import { deriveMemoryEvolutionSignals } from "@/features/cognition/memory-evolution";
import { deriveMemoryResponse } from "@/features/cognition/orchestrator";
import { deriveConceptProfile } from "@/features/exploration/concept-profile";
import { deriveConceptRelationships } from "@/features/exploration/concept-relationships";
import {
  buildKnowledgeBackup,
  parseKnowledgeBackupJson,
  restoreKnowledgeBackup,
  serializeKnowledgeBackup,
} from "@/features/knowledge-backup/knowledge-backup";
import { searchNodes } from "@/features/recovery/search-nodes";
import { processPull, processPush } from "../../server/src/sync/sync-service";
import { InMemorySyncStore } from "../../server/src/testing/in-memory-sync-store";
import { InMemoryContextRepository } from "@/tests/fakes/in-memory-context-repository";
import { InMemoryNodeContextRelationRepository } from "@/tests/fakes/in-memory-node-context-relation-repository";
import { InMemoryNodeRepository } from "@/tests/fakes/in-memory-node-repository";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const deviceId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-08-01T12:00:00.000Z");

describe("cognitive consolidation phase 1 characterization", () => {
  it("freezes memory recall, concept suggestions and semantic support boundaries", async () => {
    const sleep = concept({
      id: "33333333-3333-4333-8333-333333333333",
      name: "Descanso",
      aliases: ["Sueño reparador"],
      normalizedAliases: ["sueno reparador"],
    });
    const phone = concept({
      id: "44444444-4444-4444-8444-444444444444",
      name: "Teléfono",
    });
    const captures = [
      capture({
        id: "55555555-5555-4555-8555-555555555555",
        content: "El teléfono mejora el descanso.",
      }),
      capture({
        id: "66666666-6666-4666-8666-666666666666",
        content: "El teléfono no mejora el descanso.",
      }),
      capture({
        id: "77777777-7777-4777-8777-777777777777",
        content: "Rutina de sueño reparador sin pantalla.",
      }),
    ];
    const relations = [
      relation({ nodeId: captures[0].id, contextId: sleep.id }),
      relation({ nodeId: captures[0].id, contextId: phone.id }),
      relation({ nodeId: captures[2].id, contextId: sleep.id }),
    ];
    const repositories = {
      contextRepository: new InMemoryContextRepository([sleep, phone]),
      nodeContextRelationRepository:
        new InMemoryNodeContextRelationRepository(relations),
      nodeRepository: new InMemoryNodeRepository(captures),
    };

    expect(
      suggestAssociations(buildAssociationIndex({ nodes: captures, relations }), {
        text: "El teléfono mejora el descanso.",
      }).map((suggestion) => suggestion.node.id),
    ).toEqual(["55555555-5555-4555-8555-555555555555"]);

    const searchByLiteral = await searchNodes(repositories, {
      workspaceId,
      query: "mejora descanso",
    });
    expect(searchByLiteral[0]).toMatchObject({
      nodeId: captures[0].id,
      matchedFields: ["content"],
    });

    const searchByConcept = await searchNodes(repositories, {
      workspaceId,
      query: "descanso",
    });
    expect(searchByConcept.map((result) => result.nodeId)).toEqual([
      captures[0].id,
      captures[1].id,
      captures[2].id,
    ]);
    expect(searchByConcept[0].matchedFields).toContain("concept");

    const searchByAlias = await searchNodes(repositories, {
      workspaceId,
      query: "sueño reparador",
    });
    expect(searchByAlias.map((result) => result.nodeId)).toEqual([
      captures[2].id,
      captures[0].id,
    ]);
    expect(searchByAlias[1].matchedFields).toContain("alias");

    await expect(
      searchNodes(
        {
          ...repositories,
          semanticSimilarity: {
            async findSimilarCaptures() {
              return [
                {
                  node: captures[1],
                  evidence: {
                    similarity: 0.99,
                    rank: 1,
                    marginToNext: null,
                  },
                },
              ];
            },
          },
        },
        {
          workspaceId,
          query: "consulta sin soporte local",
        },
      ),
    ).resolves.toEqual([]);

    const evaluation = evaluateCaptureInput({
      text: "El descanso con teléfono",
      nodes: captures,
      contexts: [sleep, phone],
      relations,
    });
    expect(
      evaluation.conceptSuggestions
        .filter((suggestion) => suggestion.kind === "existing")
        .map((suggestion) => suggestion.label),
    ).toEqual(["Descanso", "Teléfono"]);
  });

  it("freezes concept detail, relationships, behavioral patterns and evolution signals", () => {
    const concepts = [
      concept({ id: "33333333-3333-4333-8333-333333333333", name: "Descanso" }),
      concept({ id: "44444444-4444-4444-8444-444444444444", name: "Horario" }),
    ];
    const captures = [
      capture({
        id: "55555555-5555-4555-8555-555555555555",
        updatedAt: "2026-06-15T10:00:00.000Z",
      }),
      capture({
        id: "66666666-6666-4666-8666-666666666666",
        updatedAt: "2026-07-20T10:00:00.000Z",
      }),
      capture({
        id: "77777777-7777-4777-8777-777777777777",
        updatedAt: "2026-07-25T10:00:00.000Z",
      }),
    ];
    const relations = captures.flatMap((item) => [
      relation({ nodeId: item.id, contextId: concepts[0].id }),
      relation({ nodeId: item.id, contextId: concepts[1].id }),
    ]);

    expect(
      deriveConceptRelationships({
        sourceConceptId: concepts[0].id,
        contexts: concepts,
        nodes: captures,
        relations,
        now,
      }),
    ).toMatchObject([
      {
        sourceConceptId: concepts[0].id,
        targetConceptId: concepts[1].id,
        sharedMemoryCount: 3,
        strength: "MEDIUM",
      },
    ]);

    expect(
      deriveBehavioralPatterns({
        contexts: concepts,
        nodes: captures,
        relations,
        now,
      }).map((pattern) => pattern.kind),
    ).toContain("RECURRENT_PAIR");

    expect(
      deriveMemoryEvolutionSignals({
        contexts: concepts,
        nodes: captures,
        relations,
        now,
      }).map((signal) => signal.kind),
    ).toContain("GROWING_CONCEPT");

    const profile = deriveConceptProfile({
      currentContextId: concepts[0].id,
      contexts: concepts,
      nodes: captures,
      relations,
      now,
    });
    expect(profile).toMatchObject({
      concept: { id: concepts[0].id, canonicalLabel: "Descanso" },
      memoryCount: 3,
      relatedConcepts: [{ conceptId: concepts[1].id }],
    });

    const response = deriveMemoryResponse({
      contexts: concepts,
      nodes: captures,
      relations,
      query: {
        text: "descanso",
        detectedConceptIds: [concepts[0].id],
        selectedConceptIds: [],
        now,
      },
    });
    expect(response.summary).toMatchObject({
      totalConcepts: 1,
      totalRelationships: 1,
      activeSuggestions: 1,
    });
  });

  it("freezes backup/restore serialized keys and sync push/pull/archive/reset contracts", async () => {
    const workspace: Workspace = {
      id: workspaceId,
      name: "Personal",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const concepts = [concept({ id: "33333333-3333-4333-8333-333333333333" })];
    const captures = [capture({ id: "44444444-4444-4444-8444-444444444444" })];
    const relations = [
      relation({
        id: "55555555-5555-4555-8555-555555555555",
        nodeId: captures[0].id,
        contextId: concepts[0].id,
      }),
    ];
    const backup = buildKnowledgeBackup({
      workspace,
      concepts,
      captures,
      relations,
      exportedAt: "2026-08-01T00:00:00.000Z",
    });
    const serialized = serializeKnowledgeBackup(backup);

    expect(JSON.parse(serialized).memory).toEqual(
      expect.objectContaining({
        captures: expect.any(Array),
        concepts: expect.any(Array),
        relations: expect.any(Array),
      }),
    );
    expect(parseKnowledgeBackupJson(serialized)).toEqual(backup);

    const restoreRepositories = {
      conceptRepository: new InMemoryContextRepository(),
      captureRepository: new InMemoryNodeRepository(),
      captureConceptRelationRepository:
        new InMemoryNodeContextRelationRepository(),
    };
    await expect(
      restoreKnowledgeBackup({
        backup,
        workspace,
        deviceId,
        repositories: restoreRepositories,
      }),
    ).resolves.toMatchObject({
      createdNodes: 1,
      createdContexts: 1,
      createdRelations: 1,
    });

    const store = new InMemorySyncStore([workspaceId]);
    const pushed = await processPush(store, {
      workspaceId,
      deviceId,
      mutations: [
        captureMutation({
          mutationId: "66666666-6666-4666-8666-666666666666",
          entityId: captures[0].id,
          baseVersion: null,
        }),
      ],
    });
    expect(pushed.accepted).toMatchObject([
      { entityType: "capture", entityId: captures[0].id, version: 1 },
    ]);

    const archived = await processPush(store, {
      workspaceId,
      deviceId,
      mutations: [
        archiveMutation({
          mutationId: "77777777-7777-4777-8777-777777777777",
          entityId: captures[0].id,
          baseVersion: 1,
        }),
      ],
    });
    expect(archived.accepted).toMatchObject([
      { entityType: "capture", entityId: captures[0].id, version: 2 },
    ]);

    const pulled = await processPull(store, {
      workspaceId,
      cursor: "0",
      limit: 10,
    });
    expect(pulled.changes.map((change) => change.operation)).toEqual([
      "upsert",
      "archive",
    ]);

    await expect(
      store.resetKnowledge({
        workspaceId,
        occurredAt: new Date("2026-08-01T01:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      workspaceId,
      deleted: { captures: 1, concepts: 0, relations: 0 },
    });
  });

  it("registers every temporary terminology alias introduced in phase 1", () => {
    expect(PENDING_TERMINOLOGY_ALIASES.map((alias) => alias.legacy)).toEqual([
      "Node",
      "Context",
      "NodeContextRelation",
      "NodeRepository",
      "ContextRepository",
      "NodeContextRelationRepository",
    ]);
  });
});

function capture(overrides: Partial<Capture> = {}): Capture {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    workspaceId,
    type: "NOTE",
    content: "El horario regular mejora el descanso.",
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: overrides.createdAt ?? overrides.updatedAt ?? "2026-07-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-01T00:00:00.000Z",
    deletedAt: null,
    createdByDeviceId: deviceId,
    lastModifiedByDeviceId: deviceId,
    ...overrides,
  };
}

function concept(overrides: Partial<Concept> = {}): Concept {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    workspaceId,
    type: "AREA",
    name: "Descanso",
    description: null,
    aliases: [],
    normalizedAliases: [],
    version: 1,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function relation(overrides: Partial<CaptureConceptRelation> = {}): CaptureConceptRelation {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    workspaceId,
    nodeId: overrides.nodeId ?? "44444444-4444-4444-8444-444444444444",
    contextId: overrides.contextId ?? "33333333-3333-4333-8333-333333333333",
    version: 1,
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function captureMutation({
  mutationId,
  entityId,
  baseVersion,
}: {
  mutationId: string;
  entityId: string;
  baseVersion: number | null;
}) {
  return {
    mutationId,
    entityType: "capture" as const,
    entityId,
    baseVersion,
    operation: "upsert" as const,
    payload: {
      content: "Captura sincronizada.",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      archivedAt: null,
    },
  };
}

function archiveMutation({
  mutationId,
  entityId,
  baseVersion,
}: {
  mutationId: string;
  entityId: string;
  baseVersion: number;
}) {
  return {
    mutationId,
    entityType: "capture" as const,
    entityId,
    baseVersion,
    operation: "archive" as const,
    payload: {
      updatedAt: "2026-08-01T00:30:00.000Z",
      archivedAt: "2026-08-01T00:30:00.000Z",
    },
  };
}
