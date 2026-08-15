import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@/domain/context/context";
import type { Node } from "@/domain/node/node";
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
});

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
