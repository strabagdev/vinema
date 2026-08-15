import { describe, expect, it } from "vitest";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { deriveKnowledgeSuggestions } from "@/features/cognition/knowledge-suggestions";

const now = new Date("2026-08-01T12:00:00.000Z");

describe("Knowledge Suggestions v1", () => {
  it("suggests related knowledge from derived relationships", () => {
    const setup = setupMemory({
      concepts: ["mitcom", "tracking"],
      dates: [
        "2026-04-01T10:00:00.000Z",
        "2026-06-01T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });

    const suggestions = deriveKnowledgeSuggestions({
      ...setup,
      inputConceptIds: ["mitcom"],
      now,
    });

    expect(suggestions).toContainEqual(
      expect.objectContaining({
        kind: "RELATED_NOW",
        conceptId: "tracking",
        canonicalLabel: "Tracking",
      }),
    );
  });

  it("suggests missing context from historical co-occurrence", () => {
    const setup = setupMemory({
      concepts: ["mitcom", "servidor", "sponsor"],
      dates: [
        "2026-03-01T10:00:00.000Z",
        "2026-05-01T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });

    const suggestions = deriveKnowledgeSuggestions({
      ...setup,
      inputConceptIds: ["mitcom", "servidor"],
      now,
    });

    expect(suggestions).toContainEqual(
      expect.objectContaining({
        kind: "MISSING_CONTEXT",
        conceptId: "sponsor",
      }),
    );
  });

  it("suggests revisiting dormant related concepts", () => {
    const contexts = [
      context({ id: "mitcom", name: "Mitcom" }),
      context({ id: "contratos", name: "Contratos" }),
    ];
    const nodes = [
      node({ id: "old-a", updatedAt: "2026-01-10T10:00:00.000Z" }),
      node({ id: "old-b", updatedAt: "2026-02-10T10:00:00.000Z" }),
      node({ id: "old-c", updatedAt: "2026-03-10T10:00:00.000Z" }),
      node({ id: "recent-mitcom", updatedAt: "2026-07-20T10:00:00.000Z" }),
    ];
    const relations = [
      ...relationsFor("old-a", ["mitcom", "contratos"]),
      ...relationsFor("old-b", ["mitcom", "contratos"]),
      ...relationsFor("old-c", ["mitcom", "contratos"]),
      ...relationsFor("recent-mitcom", ["mitcom"]),
    ];

    const suggestions = deriveKnowledgeSuggestions({
      contexts,
      nodes,
      relations,
      inputConceptIds: ["mitcom"],
      now,
    });

    expect(suggestions).toContainEqual(
      expect.objectContaining({
        kind: "REVISIT",
        conceptId: "contratos",
      }),
    );
  });

  it("uses behavioral and semantic evidence for confidence", () => {
    const contexts = [
      context({ id: "mitcom", name: "Mitcom" }),
      context({ id: "sponsor", name: "Sponsor" }),
    ];
    const nodes = [
      node({
        id: "a",
        content: "Mitcom depende de Sponsor para aprobar presupuesto.",
        updatedAt: "2026-04-01T10:00:00.000Z",
      }),
      node({
        id: "b",
        content: "Mitcom depende de Sponsor para desbloquear contrato.",
        updatedAt: "2026-06-01T10:00:00.000Z",
      }),
      node({
        id: "c",
        content: "Mitcom y Sponsor revisan seguimiento comercial.",
        updatedAt: "2026-07-20T10:00:00.000Z",
      }),
    ];
    const relations = nodes.flatMap((memory) =>
      relationsFor(memory.id, ["mitcom", "sponsor"]),
    );

    const suggestions = deriveKnowledgeSuggestions({
      contexts,
      nodes,
      relations,
      inputConceptIds: ["mitcom"],
      now,
    });
    const sponsor = suggestions.find((suggestion) => suggestion.conceptId === "sponsor");

    expect(sponsor?.confidence).toBe("HIGH");
    expect(sponsor?.reasons).toEqual(
      expect.arrayContaining([
        "Patrón recurrente en tu memoria",
        "Significado observado en tus capturas",
      ]),
    );
    expect(sponsor?.evidenceNodeIds.length).toBeGreaterThanOrEqual(3);
  });

  it("does not suggest archived concepts, archived captures or already present concepts", () => {
    const contexts = [
      context({ id: "mitcom", name: "Mitcom" }),
      context({ id: "tracking", name: "Tracking" }),
      context({
        id: "archived",
        name: "Archivado",
        archivedAt: "2026-01-01T00:00:00.000Z",
      }),
    ];
    const nodes = [
      node({ id: "active-a", updatedAt: "2026-04-01T10:00:00.000Z" }),
      node({ id: "active-b", updatedAt: "2026-06-01T10:00:00.000Z" }),
      node({
        id: "archived-node",
        archivedAt: "2026-07-21T00:00:00.000Z",
        updatedAt: "2026-07-20T10:00:00.000Z",
      }),
    ];
    const relations = [
      ...relationsFor("active-a", ["mitcom", "tracking", "archived"]),
      ...relationsFor("active-b", ["mitcom", "tracking", "archived"]),
      ...relationsFor("archived-node", ["mitcom", "archived"]),
    ];

    const suggestions = deriveKnowledgeSuggestions({
      contexts,
      nodes,
      relations,
      inputConceptIds: ["mitcom", "tracking"],
      now,
    });

    expect(suggestions.some((suggestion) => suggestion.conceptId === "mitcom")).toBe(
      false,
    );
    expect(suggestions.some((suggestion) => suggestion.conceptId === "tracking")).toBe(
      false,
    );
    expect(suggestions.some((suggestion) => suggestion.conceptId === "archived")).toBe(
      true,
    );
  });

  it("deduplicates aliases and returns deterministic order", () => {
    const contexts = [
      context({ id: "vinema", name: "Vinema", aliases: ["Segundo cerebro"] }),
      context({ id: "alias", name: "Segundo cerebro" }),
      context({ id: "railway", name: "Railway" }),
      context({ id: "mitcom", name: "Mitcom" }),
    ];
    const nodes = [
      node({ id: "a", updatedAt: "2026-04-01T10:00:00.000Z" }),
      node({ id: "b", updatedAt: "2026-06-01T10:00:00.000Z" }),
      node({ id: "c", updatedAt: "2026-07-20T10:00:00.000Z" }),
    ];
    const relations = nodes.flatMap((memory) => [
      ...relationsFor(memory.id, ["vinema", "alias", "railway", "mitcom"]),
    ]);

    const first = deriveKnowledgeSuggestions({
      contexts,
      nodes,
      relations,
      inputConceptIds: ["vinema"],
      now,
    });
    const second = deriveKnowledgeSuggestions({
      contexts: [...contexts].reverse(),
      nodes: [...nodes].reverse(),
      relations: [...relations].reverse(),
      inputConceptIds: ["vinema"],
      now,
    });

    expect(first.map((suggestion) => suggestion.id)).toEqual(
      second.map((suggestion) => suggestion.id),
    );
    expect(first.some((suggestion) => suggestion.conceptId === "alias")).toBe(false);
  });

  it("rebuilds from restored data and disappears after reset", () => {
    const restored = setupMemory({
      concepts: ["mitcom", "tracking"],
      dates: [
        "2026-04-01T10:00:00.000Z",
        "2026-06-01T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });

    expect(
      deriveKnowledgeSuggestions({
        ...restored,
        inputConceptIds: ["mitcom"],
        now,
      }),
    ).not.toEqual([]);
    expect(
      deriveKnowledgeSuggestions({
        contexts: restored.contexts,
        relations: [],
        nodes: [],
        inputConceptIds: ["mitcom"],
        now,
      }),
    ).toEqual([]);
  });

  it("handles a large deterministic dataset within a reasonable budget", () => {
    const contexts = [
      context({ id: "mitcom", name: "Mitcom" }),
      context({ id: "tracking", name: "Tracking" }),
      context({ id: "servidor", name: "Servidor" }),
      context({ id: "sponsor", name: "Sponsor" }),
    ];
    const nodes = Array.from({ length: 1_000 }, (_, index) =>
      node({
        id: `memory-${index}`,
        updatedAt: `2026-${String((index % 7) + 1).padStart(2, "0")}-01T10:00:00.000Z`,
      }),
    );
    const relations = nodes.flatMap((memory, index) =>
      relationsFor(
        memory.id,
        index % 2 === 0
          ? ["mitcom", "tracking", "servidor"]
          : ["mitcom", "tracking", "sponsor"],
      ),
    );
    const startedAt = performance.now();
    const suggestions = deriveKnowledgeSuggestions({
      contexts,
      nodes,
      relations,
      inputConceptIds: ["mitcom"],
      now,
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(performance.now() - startedAt).toBeLessThan(700);
  });
});

function setupMemory({
  concepts,
  dates,
}: {
  concepts: string[];
  dates: string[];
}) {
  const contexts = concepts.map((conceptId) =>
    context({
      id: conceptId,
      name: conceptId
        .split("-")
        .map((part) => part[0]?.toLocaleUpperCase("es") + part.slice(1))
        .join(" "),
    }),
  );
  const nodes = dates.map((date, index) =>
    node({
      id: `memory-${index}`,
      updatedAt: date,
    }),
  );
  const relations = nodes.flatMap((memory) => relationsFor(memory.id, concepts));

  return {
    contexts,
    nodes,
    relations,
  };
}

function context({
  id,
  name,
  aliases = [],
  archivedAt = null,
}: {
  id: string;
  name: string;
  aliases?: string[];
  archivedAt?: string | null;
}): Context {
  return {
    id,
    workspaceId: "workspace-1",
    type: "AREA",
    name,
    description: null,
    aliases,
    normalizedAliases: aliases.map((alias) => alias.toLocaleLowerCase("es")),
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt,
  };
}

function node({
  id,
  content = "Captura de conocimiento relacionada.",
  status = "ACTIVE",
  updatedAt,
  deletedAt = null,
  archivedAt = null,
}: {
  id: string;
  content?: string;
  status?: Node["status"];
  updatedAt: string;
  deletedAt?: string | null;
  archivedAt?: string | null;
}): Node {
  return {
    id,
    workspaceId: "workspace-1",
    type: "NOTE",
    content,
    status,
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: updatedAt,
    contentUpdatedAt: updatedAt,
    archivedAt,
    updatedAt,
    deletedAt,
    createdByDeviceId: "device-1",
    lastModifiedByDeviceId: "device-1",
  };
}

function relationsFor(nodeId: string, contextIds: string[]): NodeContextRelation[] {
  return contextIds.map((contextId) => ({
    id: `${nodeId}-${contextId}`,
    workspaceId: "workspace-1",
    nodeId,
    contextId,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  }));
}
