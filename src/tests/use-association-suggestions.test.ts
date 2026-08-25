import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@/domain/context/context";
import type { Node } from "@/domain/node/node";
import type { ConceptSuggestion } from "@/features/associations/association-types";

const evaluateCaptureInputSpy = vi.hoisted(() => vi.fn());

vi.mock("@/features/associations/capture-input-evaluation", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/associations/capture-input-evaluation")
  >();

  return {
    ...actual,
    evaluateCaptureInput: (
      ...args: Parameters<typeof actual.evaluateCaptureInput>
    ) => {
      evaluateCaptureInputSpy(...args);
      return actual.evaluateCaptureInput(...args);
    },
  };
});

import { useAssociationSuggestions } from "@/features/associations/use-association-suggestions";
import { InMemoryContextRepository } from "@/tests/fakes/in-memory-context-repository";
import { InMemoryNodeContextRelationRepository } from "@/tests/fakes/in-memory-node-context-relation-repository";
import { InMemoryNodeRepository } from "@/tests/fakes/in-memory-node-repository";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

class DeferredNodeRepository extends InMemoryNodeRepository {
  private readonly resolvers: Array<(nodes: Node[]) => void> = [];

  override async listByWorkspace(
    workspaceId: string,
    options: { includeArchived?: boolean } = {},
  ): Promise<Node[]> {
    return new Promise((resolve) => {
      this.resolvers.push(async () => {
        resolve(await super.listByWorkspace(workspaceId, options));
      });
    });
  }

  releaseNext() {
    const resolver = this.resolvers.shift();
    resolver?.([]);
  }

  get pendingCount() {
    return this.resolvers.length;
  }
}

describe("useAssociationSuggestions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    evaluateCaptureInputSpy.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("does not let a stale pending evaluation replace the latest text analysis", async () => {
    const nodeRepository = new DeferredNodeRepository();
    const contextRepository = new InMemoryContextRepository([
      context({ id: "postgresql", name: "PostgreSQL", aliases: ["Postgres"] }),
      context({ id: "railway", name: "Railway" }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository();
    const observedConcepts: string[][] = [];

    function Probe({ text }: { text: string }) {
      const state = useAssociationSuggestions({
        text,
        workspaceId: "workspace-1",
        selectedCaptureIds: [],
        contextRepository,
        nodeRepository,
        relationRepository,
      });

      useEffect(() => {
        observedConcepts.push(
          state.conceptSuggestions
            .filter((suggestion) => suggestion.kind === "existing")
            .map((suggestion) => suggestion.conceptId),
        );
      }, [state]);

      return null;
    }

    await act(async () => {
      root.render(createElement(Probe, { text: "Postgres requiere respaldo" }));
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });
    expect(nodeRepository.pendingCount).toBe(1);

    await act(async () => {
      root.render(createElement(Probe, { text: "Railway requiere revision" }));
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });
    expect(nodeRepository.pendingCount).toBe(2);

    await act(async () => {
      nodeRepository.releaseNext();
      await Promise.resolve();
    });

    await act(async () => {
      nodeRepository.releaseNext();
      await Promise.resolve();
    });

    expect(observedConcepts.at(-1)).toEqual(["railway"]);
    expect(observedConcepts).not.toContainEqual(["postgresql"]);
  });

  it("keeps the concept suggestion snapshot stable when selecting a concept", async () => {
    const text =
      "La segregación mediante barreras físicas disminuye la exposición de peatones a equipos móviles durante las maniobras.";
    const nodeRepository = new InMemoryNodeRepository();
    const contextRepository = new InMemoryContextRepository([
      context({ id: "segregacion-fisica", name: "Segregación física" }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository();
    const observed: ConceptSuggestion[][] = [];

    function Probe({ selectedContextIds }: { selectedContextIds: string[] }) {
      const state = useAssociationSuggestions({
        text,
        workspaceId: "workspace-1",
        selectedCaptureIds: [],
        selectedContextIds,
        contextRepository,
        nodeRepository,
        relationRepository,
      });

      useEffect(() => {
        if (state.status === "ready") {
          observed.push(state.conceptSuggestions);
        }
      }, [state]);

      return null;
    }

    await act(async () => {
      root.render(createElement(Probe, { selectedContextIds: [] }));
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ASSOCIATION_TEST_DEBOUNCE_MS);
    });

    const initial = observed.at(-1) ?? [];
    const initialLabels = initial.map(getConceptSuggestionLabel);

    expect(initialLabels).toEqual([]);
    expect(evaluateCaptureInputSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        createElement(Probe, {
          selectedContextIds: ["segregacion-fisica"],
        }),
      );
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ASSOCIATION_TEST_DEBOUNCE_MS);
    });

    const afterSelection = observed.at(-1) ?? [];

    expect(evaluateCaptureInputSpy).toHaveBeenCalledTimes(1);
    expect(afterSelection.map(getConceptSuggestionLabel)).toEqual(initialLabels);
    expect(afterSelection.map(getConceptSuggestionKey)).toEqual(
      initial.map(getConceptSuggestionKey),
    );
    expect(afterSelection.map(getConceptSuggestionLabel)).toEqual([]);
  });
});

const ASSOCIATION_TEST_DEBOUNCE_MS = 320;

function getConceptSuggestionLabel(suggestion: ConceptSuggestion) {
  return suggestion.kind === "existing"
    ? suggestion.label
    : suggestion.suggestedLabel;
}

function getConceptSuggestionKey(suggestion: ConceptSuggestion) {
  return suggestion.kind === "existing"
    ? `existing:${suggestion.conceptId}`
    : `emerging:${suggestion.candidateId}`;
}

function context({
  id,
  name,
  aliases = [],
}: {
  id: string;
  name: string;
  aliases?: string[];
}): Context {
  return {
    id,
    workspaceId: "workspace-1",
    type: "AREA",
    name,
    description: null,
    aliases,
    normalizedAliases: [],
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
  };
}
