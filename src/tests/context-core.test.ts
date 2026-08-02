import { describe, expect, it } from "vitest";
import type { Context } from "@/domain/context/context";
import type { Device } from "@/domain/device/device";
import { DevicePlatform } from "@/domain/device/device";
import type { Node } from "@/domain/node/node";
import type { Workspace } from "@/domain/workspace/workspace";
import { archiveContext } from "@/features/context/archive-context";
import { createContext } from "@/features/context/create-context";
import {
  attachNodeToContext,
  detachNodeFromContext,
  listContextsForNode,
  listNodesForContext,
} from "@/features/context/node-context-relations";
import { restoreContext } from "@/features/context/restore-context";
import { updateContext } from "@/features/context/update-context";
import { archiveNode } from "@/features/node/archive-node";
import { InMemoryContextRepository } from "@/tests/fakes/in-memory-context-repository";
import { InMemoryNodeContextRelationRepository } from "@/tests/fakes/in-memory-node-context-relation-repository";
import { InMemoryNodeRepository } from "@/tests/fakes/in-memory-node-repository";

const workspace: Workspace = {
  id: "workspace-1",
  name: "Personal",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const otherWorkspace: Workspace = {
  id: "workspace-2",
  name: "Trabajo",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

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
    workspaceId: workspace.id,
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
    workspaceId: workspace.id,
    type: "AREA",
    name: "Trabajo",
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

describe("Context core", () => {
  it("creates areas, projects and people with trimmed names", async () => {
    const repository = new InMemoryContextRepository();

    const area = await createContext(repository, {
      workspaceId: workspace.id,
      type: "AREA",
      name: "  Trabajo  ",
    });
    const project = await createContext(repository, {
      workspaceId: workspace.id,
      type: "PROJECT",
      name: "MITAT",
    });
    const person = await createContext(repository, {
      workspaceId: workspace.id,
      type: "PERSON",
      name: "Juan Perez",
      description: "  Proveedor  ",
    });

    expect(area.name).toBe("Trabajo");
    expect(project.type).toBe("PROJECT");
    expect(person.description).toBe("Proveedor");
  });

  it("rejects empty names and invalid types", async () => {
    const repository = new InMemoryContextRepository();

    await expect(
      createContext(repository, {
        workspaceId: workspace.id,
        type: "AREA",
        name: " ",
      }),
    ).rejects.toThrow("El contexto necesita un nombre");

    await expect(
      createContext(repository, {
        workspaceId: workspace.id,
        type: "TAG" as "AREA",
        name: "Invalido",
      }),
    ).rejects.toThrow("El tipo de contexto no es valido");
  });

  it("updates, archives, restores and lists contexts by type", async () => {
    const repository = new InMemoryContextRepository();
    const area = await createContext(repository, {
      workspaceId: workspace.id,
      type: "AREA",
      name: "Trabajo",
    });
    await createContext(repository, {
      workspaceId: workspace.id,
      type: "PROJECT",
      name: "MITAT",
    });

    const updatedArea = await updateContext(repository, {
      id: area.id,
      name: "Trabajo profundo",
      description: "Area principal",
    });
    const archivedArea = await archiveContext(repository, area.id);

    await expect(
      repository.list({ workspaceId: workspace.id, type: "AREA" }),
    ).resolves.toEqual([]);
    await expect(
      repository.list({
        workspaceId: workspace.id,
        type: "AREA",
        includeArchived: true,
      }),
    ).resolves.toMatchObject([{ id: area.id }]);

    const restoredArea = await restoreContext(repository, area.id);

    expect(updatedArea.name).toBe("Trabajo profundo");
    expect(archivedArea.archivedAt).toEqual(expect.any(String));
    expect(restoredArea.archivedAt).toBeNull();
  });

  it("prevents duplicate names within the same workspace and type", async () => {
    const repository = new InMemoryContextRepository();

    await createContext(repository, {
      workspaceId: workspace.id,
      type: "AREA",
      name: " Desarrollo ",
    });
    await createContext(repository, {
      workspaceId: workspace.id,
      type: "PROJECT",
      name: "desarrollo",
    });
    await createContext(repository, {
      workspaceId: otherWorkspace.id,
      type: "AREA",
      name: "desarrollo",
    });

    await expect(
      createContext(repository, {
        workspaceId: workspace.id,
        type: "AREA",
        name: "desarrollo",
      }),
    ).rejects.toThrow("Ya existe un contexto de este tipo con ese nombre");
  });
});

describe("Node context relations", () => {
  it("associates one node with multiple contexts without changing the node", async () => {
    const node = makeNode({ id: "note-1" });
    const area = makeContext({ id: "area-1", type: "AREA", name: "Trabajo" });
    const project = makeContext({
      id: "project-1",
      type: "PROJECT",
      name: "MITAT",
    });
    const person = makeContext({
      id: "person-1",
      type: "PERSON",
      name: "Juan Perez",
    });
    const nodeRepository = new InMemoryNodeRepository([node]);
    const contextRepository = new InMemoryContextRepository([
      area,
      project,
      person,
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository();
    const repositories = {
      contextRepository,
      nodeContextRelationRepository: relationRepository,
      nodeRepository,
    };

    await attachNodeToContext(repositories, {
      nodeId: node.id,
      contextId: area.id,
    });
    await attachNodeToContext(repositories, {
      nodeId: node.id,
      contextId: project.id,
    });
    await attachNodeToContext(repositories, {
      nodeId: node.id,
      contextId: person.id,
    });

    await expect(
      listContextsForNode(repositories, { nodeId: node.id }),
    ).resolves.toEqual([person, project, area]);
    await expect(nodeRepository.findById(node.id)).resolves.toEqual(node);
    expect("context" in node).toBe(false);
  });

  it("is idempotent and prevents duplicate node-context relations", async () => {
    const node = makeNode({ id: "note-1" });
    const context = makeContext({ id: "area-1" });
    const repositories = {
      contextRepository: new InMemoryContextRepository([context]),
      nodeContextRelationRepository: new InMemoryNodeContextRelationRepository(),
      nodeRepository: new InMemoryNodeRepository([node]),
    };

    const firstRelation = await attachNodeToContext(repositories, {
      nodeId: node.id,
      contextId: context.id,
    });
    const secondRelation = await attachNodeToContext(repositories, {
      nodeId: node.id,
      contextId: context.id,
    });

    expect(secondRelation).toEqual(firstRelation);
    await expect(
      repositories.nodeContextRelationRepository.listByNodeId(node.id),
    ).resolves.toHaveLength(1);
  });

  it("relates multiple nodes to the same context and orders nodes by updatedAt", async () => {
    const oldNode = makeNode({
      id: "old",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const newNode = makeNode({
      id: "new",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    const context = makeContext({ id: "project-1", type: "PROJECT" });
    const repositories = {
      contextRepository: new InMemoryContextRepository([context]),
      nodeContextRelationRepository: new InMemoryNodeContextRelationRepository(),
      nodeRepository: new InMemoryNodeRepository([oldNode, newNode]),
    };

    await attachNodeToContext(repositories, {
      nodeId: oldNode.id,
      contextId: context.id,
    });
    await attachNodeToContext(repositories, {
      nodeId: newNode.id,
      contextId: context.id,
    });

    await expect(
      listNodesForContext(repositories, { contextId: context.id }),
    ).resolves.toEqual([newNode, oldNode]);
  });

  it("rejects relations across workspaces", async () => {
    const node = makeNode({ id: "note-1", workspaceId: workspace.id });
    const context = makeContext({
      id: "area-1",
      workspaceId: otherWorkspace.id,
    });
    const repositories = {
      contextRepository: new InMemoryContextRepository([context]),
      nodeContextRelationRepository: new InMemoryNodeContextRelationRepository(),
      nodeRepository: new InMemoryNodeRepository([node]),
    };

    await expect(
      attachNodeToContext(repositories, {
        nodeId: node.id,
        contextId: context.id,
      }),
    ).rejects.toThrow("workspaces distintos");
  });

  it("filters contexts by type and excludes archived contexts by default", async () => {
    const node = makeNode({ id: "note-1" });
    const area = makeContext({ id: "area-1", type: "AREA", name: "Trabajo" });
    const archivedProject = makeContext({
      id: "project-1",
      type: "PROJECT",
      name: "MITAT",
      archivedAt: "2026-01-02T00:00:00.000Z",
    });
    const repositories = {
      contextRepository: new InMemoryContextRepository([area, archivedProject]),
      nodeContextRelationRepository: new InMemoryNodeContextRelationRepository([
        {
          id: "relation-area",
          workspaceId: workspace.id,
          nodeId: node.id,
          contextId: area.id,
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "relation-project",
          workspaceId: workspace.id,
          nodeId: node.id,
          contextId: archivedProject.id,
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ]),
      nodeRepository: new InMemoryNodeRepository([node]),
    };

    await expect(
      listContextsForNode(repositories, { nodeId: node.id, type: "AREA" }),
    ).resolves.toEqual([area]);
    await expect(
      listContextsForNode(repositories, { nodeId: node.id }),
    ).resolves.toEqual([area]);
    await expect(
      listContextsForNode(repositories, {
        nodeId: node.id,
        includeArchived: true,
      }),
    ).resolves.toEqual([archivedProject, area]);
  });

  it("rejects creating a new relation to an archived context", async () => {
    const node = makeNode({ id: "note-1" });
    const archivedContext = makeContext({
      id: "area-1",
      archivedAt: "2026-01-02T00:00:00.000Z",
    });
    const repositories = {
      contextRepository: new InMemoryContextRepository([archivedContext]),
      nodeContextRelationRepository: new InMemoryNodeContextRelationRepository(),
      nodeRepository: new InMemoryNodeRepository([node]),
    };

    await expect(
      attachNodeToContext(repositories, {
        nodeId: node.id,
        contextId: archivedContext.id,
      }),
    ).rejects.toThrow("contexto archivado");
  });

  it("excludes archived nodes by default but preserves relations", async () => {
    const node = makeNode({ id: "note-1" });
    const context = makeContext({ id: "area-1" });
    const nodeRepository = new InMemoryNodeRepository([node]);
    const relationRepository = new InMemoryNodeContextRelationRepository();
    const repositories = {
      contextRepository: new InMemoryContextRepository([context]),
      nodeContextRelationRepository: relationRepository,
      nodeRepository,
    };

    await attachNodeToContext(repositories, {
      nodeId: node.id,
      contextId: context.id,
    });
    const archivedNode = await archiveNode(nodeRepository, node.id, device);

    await expect(
      listNodesForContext(repositories, { contextId: context.id }),
    ).resolves.toEqual([]);
    await expect(
      listNodesForContext(repositories, {
        contextId: context.id,
        includeArchived: true,
      }),
    ).resolves.toEqual([archivedNode]);
    await expect(relationRepository.listByContextId(context.id)).resolves.toHaveLength(
      1,
    );
  });

  it("detaches only the relation and keeps node and context intact", async () => {
    const node = makeNode({ id: "note-1" });
    const context = makeContext({ id: "area-1" });
    const contextRepository = new InMemoryContextRepository([context]);
    const nodeRepository = new InMemoryNodeRepository([node]);
    const relationRepository = new InMemoryNodeContextRelationRepository();
    const repositories = {
      contextRepository,
      nodeContextRelationRepository: relationRepository,
      nodeRepository,
    };

    await attachNodeToContext(repositories, {
      nodeId: node.id,
      contextId: context.id,
    });
    await detachNodeFromContext(relationRepository, {
      nodeId: node.id,
      contextId: context.id,
    });
    await detachNodeFromContext(relationRepository, {
      nodeId: node.id,
      contextId: context.id,
    });

    await expect(relationRepository.listByNodeId(node.id)).resolves.toEqual([]);
    await expect(nodeRepository.findById(node.id)).resolves.toEqual(node);
    await expect(contextRepository.getById(context.id)).resolves.toEqual(context);
  });
});
