import { describe, expect, it } from "vitest";
import type { Context } from "@/domain/context/context";
import type { Device } from "@/domain/device/device";
import { DevicePlatform } from "@/domain/device/device";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { updateNode } from "@/features/node/update-node";
import { getNodeDetailPath } from "@/features/node/node-routes";
import { getContextDetailPath } from "@/features/context/context-routes";
import {
  getRecoveryPath,
  getReturnToFromSearchParams,
} from "@/features/recovery/recovery-routes";
import {
  attachNodeToContext,
  detachNodeFromContext,
} from "@/features/context/node-context-relations";
import { searchNodes } from "@/features/recovery/search-nodes";
import { InMemoryContextRepository } from "@/tests/fakes/in-memory-context-repository";
import { InMemoryNodeContextRelationRepository } from "@/tests/fakes/in-memory-node-context-relation-repository";
import { InMemoryNodeRepository } from "@/tests/fakes/in-memory-node-repository";

const workspaceId = "workspace-1";

const device: Device = {
  id: "device-1",
  name: "Vinema web",
  platform: DevicePlatform.WEB,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: "2026-01-01T00:00:00.000Z",
};

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    workspaceId,
    type: "NOTE",
    content: "Contenido",
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    createdByDeviceId: device.id,
    lastModifiedByDeviceId: device.id,
    ...overrides,
  };
}

function makeContext(overrides: Partial<Context> = {}): Context {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    workspaceId,
    type: "PROJECT",
    name: "Masa madre",
    description: null,
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
    id: overrides.id ?? crypto.randomUUID(),
    workspaceId,
    nodeId: "node-1",
    contextId: "context-1",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeRepositories({
  nodes = [],
  contexts = [],
  relations = [],
}: {
  nodes?: Node[];
  contexts?: Context[];
  relations?: NodeContextRelation[];
}) {
  return {
    contextRepository: new InMemoryContextRepository(contexts),
    nodeContextRelationRepository: new InMemoryNodeContextRelationRepository(
      relations,
    ),
    nodeRepository: new InMemoryNodeRepository(nodes),
  };
}

describe("local recovery search", () => {
  it("finds captures by content", async () => {
    const repositories = makeRepositories({
      nodes: [makeNode({ id: "node-1", content: "Pan con masa madre" })],
    });

    const results = await searchNodes(repositories, {
      workspaceId,
      query: "pan",
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      nodeId: "node-1",
      matchedFields: ["content"],
    });
  });

  it("finds sources by content and generates a relevant excerpt", async () => {
    const repositories = makeRepositories({
      nodes: [
        makeNode({
          id: "node-1",
          content:
            "Probe una receta de pan con masa madre. La fermentacion fue demasiado larga. La miga quedo humeda.",
        }),
      ],
    });

    const results = await searchNodes(repositories, {
      workspaceId,
      query: "miga humeda",
    });

    expect(results[0]?.matchedFields).toContain("content");
    expect(results[0]?.excerpt).toContain("miga quedo humeda");
  });

  it("finds sources by related context", async () => {
    const node = makeNode({ id: "node-1", content: "Receta familiar" });
    const context = makeContext({ id: "context-1", name: "Masa madre" });
    const repositories = makeRepositories({
      nodes: [node],
      contexts: [context],
      relations: [makeRelation({ nodeId: node.id, contextId: context.id })],
    });

    const results = await searchNodes(repositories, {
      workspaceId,
      query: "masa madre",
    });

    expect(results[0]?.matchedFields).toContain("context");
    expect(results[0]?.contexts).toEqual([
      {
        id: "context-1",
        name: "Masa madre",
        type: "PROJECT",
      },
    ]);
  });

  it("updates contextual results after attaching and detaching a context", async () => {
    const node = makeNode({ id: "node-1", content: "Receta familiar" });
    const context = makeContext({ id: "context-1", name: "Masa madre" });
    const repositories = makeRepositories({
      nodes: [node],
      contexts: [context],
    });

    await expect(
      searchNodes(repositories, { workspaceId, query: "masa madre" }),
    ).resolves.toEqual([]);

    await attachNodeToContext(repositories, {
      nodeId: node.id,
      contextId: context.id,
    });

    expect(
      (
        await searchNodes(repositories, {
          workspaceId,
          query: "masa madre",
        })
      ).map((result) => result.nodeId),
    ).toEqual(["node-1"]);

    await detachNodeFromContext(repositories.nodeContextRelationRepository, {
      nodeId: node.id,
      contextId: context.id,
    });

    await expect(
      searchNodes(repositories, { workspaceId, query: "masa madre" }),
    ).resolves.toEqual([]);
  });

  it("reports multiple matched fields when the same query appears in several places", async () => {
    const node = makeNode({
      id: "node-1",
      content: "La masa madre quedo activa.",
    });
    const context = makeContext({ id: "context-1", name: "Masa madre" });
    const repositories = makeRepositories({
      nodes: [node],
      contexts: [context],
      relations: [makeRelation({ nodeId: node.id, contextId: context.id })],
    });

    const results = await searchNodes(repositories, {
      workspaceId,
      query: "masa madre",
    });

    expect(results[0]?.matchedFields).toEqual([
      "content",
      "context",
      "concept",
      "association",
    ]);
  });

  it("normalizes accents, casing and redundant spaces", async () => {
    const repositories = makeRepositories({
      nodes: [
        makeNode({
          id: "node-1",
          content: "La fermentación fue demasiado larga.",
        }),
      ],
    });

    const results = await searchNodes(repositories, {
      workspaceId,
      query: "  FERMENTACION   ",
    });

    expect(results.map((result) => result.nodeId)).toEqual(["node-1"]);
  });

  it("returns an empty list for an empty query and for zero results", async () => {
    const repositories = makeRepositories({
      nodes: [makeNode({ id: "node-1", content: "Pan" })],
    });

    await expect(
      searchNodes(repositories, { workspaceId, query: "   " }),
    ).resolves.toEqual([]);
    await expect(
      searchNodes(repositories, { workspaceId, query: "cafe" }),
    ).resolves.toEqual([]);
  });

  it("orders by literal, concept and updatedAt", async () => {
    const contextMatch = makeNode({
      id: "context",
      content: "Receta",
      updatedAt: "2026-01-03T00:00:00.000Z",
    });
    const contentMatch = makeNode({
      id: "content",
      content: "El pan quedo humedo.",
      updatedAt: "2026-01-04T00:00:00.000Z",
    });
    const recentContentMatch = makeNode({
      id: "recent-content",
      content: "Pan humedo en otra prueba.",
      updatedAt: "2026-01-05T00:00:00.000Z",
    });
    const context = makeContext({ id: "context-1", name: "Pan humedo" });
    const repositories = makeRepositories({
      nodes: [contentMatch, contextMatch, recentContentMatch],
      contexts: [context],
      relations: [
        makeRelation({ nodeId: contextMatch.id, contextId: context.id }),
      ],
    });

    const results = await searchNodes(repositories, {
      workspaceId,
      query: "pan humedo",
    });

    expect(results.map((result) => result.nodeId)).toEqual([
      "recent-content",
      "content",
      "context",
    ]);
    expect(results.map((result) => result.searchRank)).toEqual([1, 2, 3]);
  });

  it("updates results after editing a source", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      makeNode({ id: "node-1", content: "Pan seco" }),
    ]);
    const repositories = {
      contextRepository: new InMemoryContextRepository(),
      nodeContextRelationRepository: new InMemoryNodeContextRelationRepository(),
      nodeRepository,
    };

    await updateNode(nodeRepository, {
      id: "node-1",
      content: "Pan humedo despues de cambiar hidratacion.",
      device,
    });

    const results = await searchNodes(repositories, {
      workspaceId,
      query: "hidratacion",
    });

    expect(results.map((result) => result.nodeId)).toEqual(["node-1"]);
  });

  it("removes deleted sources and keeps legacy archived sources in recovery results", async () => {
    const nodeRepository = new InMemoryNodeRepository([
      makeNode({ id: "node-1", content: "Pan humedo", status: "ARCHIVED" }),
      makeNode({
        id: "node-archived-at",
        content: "Pan humedo archivado",
        archivedAt: "2026-01-03T00:00:00.000Z",
      }),
      makeNode({
        id: "node-2",
        content: "Pan humedo eliminado",
        deletedAt: "2026-01-02T00:00:00.000Z",
      }),
    ]);
    const repositories = {
      contextRepository: new InMemoryContextRepository(),
      nodeContextRelationRepository: new InMemoryNodeContextRelationRepository(),
      nodeRepository,
    };

    await expect(
      searchNodes(repositories, { workspaceId, query: "pan" }),
    ).resolves.toMatchObject([{ nodeId: "node-1" }]);
  });

  it("keeps literal evidence ahead of strong semantic-only matches", async () => {
    const semanticNode = makeNode({
      id: "semantic-node",
      content: "Anteversion pelvica ejercicios",
      updatedAt: "2026-01-04T00:00:00.000Z",
    });
    const repositories = {
      ...makeRepositories({
        nodes: [
          makeNode({
            id: "literal-node",
            content: "Contrato Codelco Norte",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
          semanticNode,
        ],
      }),
      semanticSimilarity: {
        findSimilarCaptures: async () => [
          {
            node: semanticNode,
            evidence: { similarity: 0.92, rank: 1, marginToNext: 0.08 },
          },
        ],
      },
    };

    const results = await searchNodes(repositories, {
      workspaceId,
      query: "codelco",
    });

    expect(results.map((result) => result.nodeId)).toEqual([
      "literal-node",
      "semantic-node",
    ]);
    expect(results[0]).toMatchObject({
      matchedFields: ["content"],
      rankCategory: "literal",
    });
    expect(results[1]).toMatchObject({
      matchedFields: ["semantic"],
      rankCategory: "semantic-only",
    });
  });

  it("does not admit weak semantic-only matches into manual search", async () => {
    const unrelatedNode = makeNode({
      id: "anteversion",
      content: "Anteversion Pelvica Ejercicios",
    });
    const repositories = {
      ...makeRepositories({ nodes: [unrelatedNode] }),
      semanticSimilarity: {
        findSimilarCaptures: async () => [
          {
            node: unrelatedNode,
            evidence: { similarity: 0.52, rank: 1, marginToNext: 0.03 },
          },
        ],
      },
    };

    await expect(
      searchNodes(repositories, { workspaceId, query: "vinema" }),
    ).resolves.toEqual([]);
  });

  it("does not reuse stale semantic results between successive searches", async () => {
    const codelcoNode = makeNode({
      id: "codelco-node",
      content: "Contrato Codelco",
    });
    const seenQueries: string[] = [];
    const repositories = {
      ...makeRepositories({ nodes: [codelcoNode] }),
      semanticSimilarity: {
        findSimilarCaptures: async (input: { text: string }) => {
          seenQueries.push(input.text);
          return input.text === "codelco"
            ? [
                {
                  node: codelcoNode,
                  evidence: { similarity: 0.9, rank: 1, marginToNext: 0.08 },
                },
              ]
            : [];
        },
      },
    };

    await expect(
      searchNodes(repositories, { workspaceId, query: "vinema" }),
    ).resolves.toEqual([]);
    await expect(
      searchNodes(repositories, { workspaceId, query: "codelco" }),
    ).resolves.toMatchObject([{ nodeId: "codelco-node" }]);
    expect(seenQueries).toEqual(["vinema", "codelco"]);
  });

  it("finds captures through canonical concepts, aliases, associations and backed relationships", async () => {
    const repositories = makeRepositories({
      nodes: [
        makeNode({ id: "associated", content: "Bitacora operativa" }),
        makeNode({ id: "alias", content: "Bitacora del proveedor" }),
        makeNode({ id: "related", content: "Revision posterior" }),
      ],
      contexts: [
        makeContext({
          id: "codelco",
          name: "Codelco",
          aliases: ["Cliente minero"],
          normalizedAliases: ["mandante rojo"],
        }),
      ],
      relations: [
        makeRelation({ nodeId: "associated", contextId: "codelco" }),
        makeRelation({ nodeId: "alias", contextId: "codelco" }),
        makeRelation({
          id: "association-associated-related",
          nodeId: "associated",
          contextId: "related",
          relatedNodeId: "related",
          relationType: "CAPTURE_ASSOCIATION",
        }),
      ],
    });

    const canonicalResults = await searchNodes(repositories, {
      workspaceId,
      query: "codelco",
      includeContexts: false,
    });
    const aliasResults = await searchNodes(repositories, {
      workspaceId,
      query: "mandante rojo",
      includeContexts: false,
    });

    expect(canonicalResults.map((result) => result.nodeId)).toEqual([
      "associated",
      "alias",
      "related",
    ]);
    expect(canonicalResults[0]).toMatchObject({
      matchedFields: expect.arrayContaining(["concept", "association"]),
      contexts: [],
      rankCategory: "canonical-concept",
    });
    expect(canonicalResults[2]).toMatchObject({
      matchedFields: expect.arrayContaining(["relationship"]),
      rankCategory: "backed-relationship",
    });
    expect(aliasResults[0]).toMatchObject({
      matchedFields: expect.arrayContaining(["alias", "association"]),
      rankCategory: "alias",
    });
  });

  it("merges strong local semantic matches without surfacing archived captures", async () => {
    const semanticNode = makeNode({
      id: "semantic-node",
      content: "Bitacora de respiracion antes de dormir",
    });
    const archivedNode = makeNode({
      id: "archived-semantic-node",
      content: "Respiracion archivada",
      status: "ARCHIVED",
      archivedAt: "2026-01-03T00:00:00.000Z",
    });
    const repositories = {
      ...makeRepositories({
        nodes: [
          makeNode({ id: "literal-node", content: "Pan con masa madre" }),
          semanticNode,
        ],
      }),
      semanticSimilarity: {
        findSimilarCaptures: async () => [
          {
            node: semanticNode,
            evidence: { similarity: 0.88, rank: 1, marginToNext: 0.08 },
          },
          {
            node: archivedNode,
            evidence: { similarity: 0.9, rank: 2, marginToNext: null },
          },
        ],
      },
    };

    const results = await searchNodes(repositories, {
      workspaceId,
      query: "pan",
    });

    expect(results.map((result) => result.nodeId)).toContain("literal-node");
    expect(results.map((result) => result.nodeId)).toContain("semantic-node");
    expect(results.map((result) => result.nodeId)).not.toContain(
      "archived-semantic-node",
    );
    expect(results.find((result) => result.nodeId === "semantic-node")).toMatchObject({
      matchedFields: ["semantic"],
      semantic: { similarity: 0.88 },
    });
  });

  it("builds recovery navigation paths for source detail", () => {
    expect(getRecoveryPath("pan humedo")).toBe("/memory?q=pan%20humedo");
    expect(
      getNodeDetailPath("node-1", { returnTo: getRecoveryPath("pan humedo") }),
    ).toBe("/memory/detail?nodeId=node-1&returnTo=%2Fmemory%3Fq%3Dpan%2520humedo");
  });

  it("builds context navigation paths from recovery results", () => {
    expect(
      getContextDetailPath("context with spaces", {
        returnTo: getRecoveryPath("pan humedo"),
      }),
    ).toBe(
      "/contexts/detail?contextId=context%20with%20spaces&returnTo=%2Fmemory%3Fq%3Dpan%2520humedo",
    );
  });

  it("accepts only safe internal returnTo paths", () => {
    expect(
      getReturnToFromSearchParams(
        new URLSearchParams("returnTo=/search?q=pan%20humedo"),
      ),
    ).toBe("/search?q=pan humedo");
    expect(
      getReturnToFromSearchParams(
        new URLSearchParams("returnTo=/memory?q=pan%20humedo"),
      ),
    ).toBe("/memory?q=pan humedo");
    expect(
      getReturnToFromSearchParams(
        new URLSearchParams("returnTo=https%3A%2F%2Fevil.example"),
      ),
    ).toBeNull();
    expect(
      getReturnToFromSearchParams(new URLSearchParams("returnTo=//evil.example")),
    ).toBeNull();
    expect(
      getReturnToFromSearchParams(
        new URLSearchParams("returnTo=javascript%3Aalert%281%29"),
      ),
    ).toBeNull();
  });
});
