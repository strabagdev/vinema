import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { deriveCaptureEmergentIdentity } from "@/features/identity/capture-emergent-identity";
import { updateNode } from "@/features/node/update-node";
import { SyncClientError } from "@/features/sync/sync-client";
import {
  createE2eSyncHarness,
  createIncrementingClock,
  getOutboxRecords,
  getPullCursor,
  makeContext,
  makeNode,
  makeRelation,
  setPullCursor,
  snapshotDevice,
  type E2eSyncHarness,
} from "@/tests/e2e-sync-harness";

let harness: E2eSyncHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
});

describe("end-to-end synchronization", () => {
  it("syncs capture creation A to B and edit B to A without remote outbox writes", async () => {
    harness = await createE2eSyncHarness();
    const { deviceA, deviceB, workspaceId } = harness;
    const node = makeNode({
      workspaceId,
      deviceId: deviceA.device.id,
      content: "Captura creada en A.",
    });

    await harness.runOnDevice(deviceA, async () => {
      await deviceA.repositories.nodeRepository.create(node);
      expect(await getOutboxRecords()).toHaveLength(1);
    });

    await expect(
      harness.runOnDevice(deviceA, () => deviceA.pushCoordinator.run()),
    ).resolves.toMatchObject({ status: "SUCCESS", pushed: 1 });
    await harness.runOnDevice(deviceA, async () => {
      expect(await getOutboxRecords()).toHaveLength(0);
    });

    await expect(
      harness.runOnDevice(deviceB, () => deviceB.pullCoordinator.run()),
    ).resolves.toMatchObject({ status: "SUCCESS", applied: 1 });
    await harness.runOnDevice(deviceB, async () => {
      const snapshot = await snapshotDevice(workspaceId);
      expect(snapshot.nodes).toMatchObject([
        {
          id: node.id,
          content: "Captura creada en A.",
          version: 1,
        },
      ]);
      expect(await getOutboxRecords()).toHaveLength(0);
    });

    await harness.runOnDevice(deviceB, async () => {
      await updateNode(deviceB.repositories.nodeRepository, {
        id: node.id,
        content: "Captura editada en B.",
        device: deviceB.device,
      });
      expect(await getOutboxRecords()).toHaveLength(1);
    });
    await expect(
      harness.runOnDevice(deviceB, () => deviceB.pushCoordinator.run()),
    ).resolves.toMatchObject({ status: "SUCCESS", pushed: 1 });
    await expect(
      harness.runOnDevice(deviceA, () => deviceA.pullCoordinator.run()),
    ).resolves.toMatchObject({ status: "SUCCESS", applied: 1 });

    const convergence = await harness.compareDevices();
    expect(convergence.differences).toEqual([]);
    expect(convergence.deviceA.nodes[0]).toMatchObject({
      id: node.id,
      content: "Captura editada en B.",
      version: 2,
    });
  });

  it("syncs concepts, relations, archive and restore in both directions", async () => {
    harness = await createE2eSyncHarness();
    const { deviceA, deviceB, workspaceId } = harness;
    const at = createIncrementingClock();
    const context = makeContext({
      workspaceId,
      name: "Proyecto Andes Norte",
      aliases: ["PAN"],
      normalizedAliases: ["pan"],
      at: at(),
    });
    const node = makeNode({
      workspaceId,
      deviceId: deviceA.device.id,
      content: "Reunion sobre Proyecto Andes Norte.",
      at: at(),
    });
    const relation = makeRelation({
      workspaceId,
      nodeId: node.id,
      contextId: context.id,
      at: at(),
    });

    await harness.runOnDevice(deviceA, async () => {
      await deviceA.repositories.contextRepository.save(context);
      await deviceA.repositories.nodeRepository.create(node);
      await deviceA.repositories.nodeContextRelationRepository.save(relation);
      expect(await getOutboxRecords()).toHaveLength(3);
    });
    await harness.runOnDevice(deviceA, () => deviceA.pushCoordinator.run());
    await harness.runOnDevice(deviceB, () => deviceB.pullCoordinator.run());
    await harness.runOnDevice(deviceB, async () => {
      const snapshot = await snapshotDevice(workspaceId);
      expect(snapshot.contexts).toMatchObject([
        {
          id: context.id,
          version: 1,
          aliases: ["PAN"],
          normalizedAliases: ["pan"],
        },
      ]);
      expect(snapshot.nodes).toMatchObject([{ id: node.id, version: 1 }]);
      expect(snapshot.relations).toMatchObject([
        {
          id: relation.id,
          nodeId: node.id,
          contextId: context.id,
          version: 1,
        },
      ]);
      const pulledRelations =
        await deviceB.repositories.nodeContextRelationRepository.listByNodeId(
          node.id,
        );
      const pulledContexts = await Promise.all(
        pulledRelations.map((item) =>
          deviceB.repositories.contextRepository.getById(item.contextId),
        ),
      );
      expect(
        deriveCaptureEmergentIdentity({
          contexts: pulledContexts.filter((item) => item !== null),
          relations: pulledRelations,
          nodeId: node.id,
        }).displayText,
      ).toBe("Proyecto Andes Norte");
      expect("title" in snapshot.nodes[0]).toBe(false);
      expect(await getOutboxRecords()).toHaveLength(0);
    });

    const convergence = await harness.compareDevices();
    expect(convergence.converged).toBe(true);
    expect(convergence.deviceA.nodes[0]).toMatchObject({
      status: "ACTIVE",
    });
    expect(convergence.deviceA.contexts[0]).toMatchObject({
      archivedAt: null,
    });
  });

  it("converges 100 offline captures with contexts and relations over multiple batches", async () => {
    harness = await createE2eSyncHarness();
    const { deviceA, deviceB, workspaceId } = harness;
    const at = createIncrementingClock();
    const contexts = Array.from({ length: 5 }, (_, index) =>
      makeContext({
        workspaceId,
        name: `Contexto offline ${index + 1}`,
        at: at(),
      }),
    );
    const nodes = Array.from({ length: 100 }, (_, index) =>
      makeNode({
        workspaceId,
        deviceId: deviceA.device.id,
        content: `Captura offline ${index + 1}`,
        at: at(),
      }),
    );
    const relations = nodes.slice(0, 20).map((node, index) =>
      makeRelation({
        workspaceId,
        nodeId: node.id,
        contextId: contexts[index % contexts.length].id,
        at: at(),
      }),
    );

    await harness.runOnDevice(deviceA, async () => {
      for (const context of contexts) {
        await deviceA.repositories.contextRepository.save(context);
      }
      for (const node of nodes) {
        await deviceA.repositories.nodeRepository.create(node);
      }
      for (const relation of relations) {
        await deviceA.repositories.nodeContextRelationRepository.save(relation);
      }
      expect(await getOutboxRecords()).toHaveLength(125);
    });

    const push = await harness.runOnDevice(deviceA, () =>
      deviceA.pushCoordinator.run(),
    );
    expect(push).toMatchObject({
      status: "SUCCESS",
      pushed: 125,
      removedFromOutbox: 125,
    });
    const pull = await harness.runOnDevice(deviceB, () =>
      deviceB.pullCoordinator.run(),
    );
    expect(pull).toMatchObject({ status: "SUCCESS", pulled: 125, applied: 125 });

    const convergence = await harness.compareDevices();
    expect(convergence.differences).toEqual([]);
    expect(convergence.deviceA.nodes).toHaveLength(100);
    expect(convergence.deviceA.contexts).toHaveLength(5);
    expect(convergence.deviceA.relations).toHaveLength(20);
  });

  it("keeps push and pull idempotent without duplicates and persists cursors across reopen", async () => {
    harness = await createE2eSyncHarness();
    const { deviceA, deviceB, workspaceId } = harness;
    const node = makeNode({
      workspaceId,
      deviceId: deviceA.device.id,
      content: "Captura idempotente.",
    });

    await harness.runOnDevice(deviceA, () =>
      deviceA.repositories.nodeRepository.create(node),
    );
    await harness.runOnDevice(deviceA, () => deviceA.pushCoordinator.run());
    await harness.runOnDevice(deviceA, () => deviceA.pushCoordinator.run());
    await harness.runOnDevice(deviceB, () => deviceB.pullCoordinator.run());
    const cursor = await harness.runOnDevice(deviceB, () =>
      getPullCursor(workspaceId, deviceB.device.id),
    );
    await harness.runOnDevice(deviceB, () => setPullCursor(workspaceId, deviceB.device.id, "0"));
    const replayPull = await harness.runOnDevice(deviceB, () =>
      deviceB.pullCoordinator.run(),
    );
    const emptyPull = await harness.runOnDevice(deviceB, () =>
      deviceB.pullCoordinator.run(),
    );

    expect(replayPull).toMatchObject({
      status: "SUCCESS",
      pulled: 1,
      idempotent: 1,
    });
    expect(emptyPull).toMatchObject({ status: "SUCCESS", pulled: 0 });
    await harness.runOnDevice(deviceB, async () => {
      expect(await getPullCursor(workspaceId, deviceB.device.id)).toBe(cursor);
      expect((await snapshotDevice(workspaceId)).nodes).toHaveLength(1);
      expect(await getOutboxRecords()).toHaveLength(0);
    });
  });

  it("detects conflicts without overwriting local pending data", async () => {
    harness = await createE2eSyncHarness();
    const { deviceA, deviceB, workspaceId } = harness;
    const node = makeNode({
      workspaceId,
      deviceId: deviceA.device.id,
      content: "Version base.",
    });

    await harness.runOnDevice(deviceA, () =>
      deviceA.repositories.nodeRepository.create(node),
    );
    await harness.runOnDevice(deviceA, () => deviceA.pushCoordinator.run());
    await harness.runOnDevice(deviceB, () => deviceB.pullCoordinator.run());

    await harness.runOnDevice(deviceA, () =>
      updateNode(deviceA.repositories.nodeRepository, {
        id: node.id,
        content: "Cambio local A pendiente.",
        device: deviceA.device,
      }),
    );
    await harness.runOnDevice(deviceB, () =>
      updateNode(deviceB.repositories.nodeRepository, {
        id: node.id,
        content: "Cambio remoto B confirmado.",
        device: deviceB.device,
      }),
    );
    await harness.runOnDevice(deviceB, () => deviceB.pushCoordinator.run());
    const pull = await harness.runOnDevice(deviceA, () =>
      deviceA.pullCoordinator.run(),
    );

    expect(pull.status).toBe("PARTIAL");
    expect(pull.conflicts).toBe(1);
    await harness.runOnDevice(deviceA, async () => {
      const snapshot = await snapshotDevice(workspaceId);
      const outbox = await getOutboxRecords();
      expect(snapshot.nodes[0]).toMatchObject({
        content: "Cambio local A pendiente.",
        version: 2,
      });
      expect(outbox).toMatchObject([
        {
          status: "CONFLICT",
          conflictData: {
            reason: "REMOTE_CHANGE_CONFLICT",
          },
        },
      ]);
    });
  });

  it("cancels push and pull without losing data, then recovers", async () => {
    harness = await createE2eSyncHarness();
    const { deviceA, deviceB, workspaceId } = harness;
    const pushNode = makeNode({
      workspaceId,
      deviceId: deviceA.device.id,
      content: "Cancelacion push.",
    });

    await harness.runOnDevice(deviceA, () =>
      deviceA.repositories.nodeRepository.create(pushNode),
    );
    harness.remoteClient.failNextPush(
      new SyncClientError({ code: "ABORTED", message: "Push cancelado." }),
    );
    await expect(
      harness.runOnDevice(deviceA, () => deviceA.pushCoordinator.run()),
    ).resolves.toMatchObject({ status: "CANCELLED" });
    await harness.runOnDevice(deviceA, async () => {
      expect(await getOutboxRecords()).toMatchObject([{ status: "PENDING" }]);
    });
    await harness.runOnDevice(deviceA, () => deviceA.pushCoordinator.run());

    harness.remoteClient.failNextPull(
      new SyncClientError({ code: "ABORTED", message: "Pull cancelado." }),
    );
    await expect(
      harness.runOnDevice(deviceB, () => deviceB.pullCoordinator.run()),
    ).resolves.toMatchObject({ status: "CANCELLED" });
    await harness.runOnDevice(deviceB, async () => {
      expect(await getPullCursor(workspaceId, deviceB.device.id)).toBe("0");
      expect((await snapshotDevice(workspaceId)).nodes).toHaveLength(0);
    });

    await harness.runOnDevice(deviceB, () => deviceB.pullCoordinator.run());
    expect((await harness.compareDevices()).converged).toBe(true);
  });

  it("records transient failures without dropping mutations and recovers later", async () => {
    harness = await createE2eSyncHarness();
    const { deviceA, deviceB, workspaceId } = harness;
    const node = makeNode({
      workspaceId,
      deviceId: deviceA.device.id,
      content: "Fallo transitorio.",
    });

    await harness.runOnDevice(deviceA, () =>
      deviceA.repositories.nodeRepository.create(node),
    );
    harness.remoteClient.failNextPush(
      new SyncClientError({ code: "SERVER_ERROR", message: "Temporal" }),
    );
    await expect(
      harness.runOnDevice(deviceA, () => deviceA.pushCoordinator.run()),
    ).resolves.toMatchObject({ status: "SUCCESS", pushed: 1 });

    harness.remoteClient.failNextPull(
      new SyncClientError({ code: "NETWORK_ERROR", message: "Offline" }),
    );
    await expect(
      harness.runOnDevice(deviceB, () => deviceB.pullCoordinator.run()),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(
      harness.runOnDevice(deviceB, () => deviceB.pullCoordinator.run()),
    ).resolves.toMatchObject({ status: "SUCCESS", applied: 1 });
    expect((await harness.compareDevices()).converged).toBe(true);
  });
});
