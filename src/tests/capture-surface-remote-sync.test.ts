import "fake-indexeddb/auto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureSurface } from "@/features/capture/capture-surface";
import { createAutomaticSyncOrchestrator } from "@/features/sync/automatic-sync-orchestrator";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";
import {
  createE2eSyncHarness,
  getOutboxRecords,
  getPullCursor,
  makeNode,
  snapshotDevice,
  type E2eSyncHarness,
} from "@/tests/e2e-sync-harness";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/notes/knowledge-base-client", () => ({
  KnowledgeBaseClient: () =>
    createElement("section", { "data-knowledge-base-client": "" }),
}));

vi.mock("@/app/notes/detail/note-detail-client", () => ({
  NoteDetailClient: () => createElement("section", { "data-note-detail": "" }),
}));

vi.mock("@/app/concepts/concept-workspace-client", () => ({
  ConceptWorkspaceClient: () =>
    createElement("section", { "data-concept-workspace": "" }),
}));

vi.mock("@/features/sync/observability/memory-sync-status-panel", () => ({
  MemorySyncStatusPanel: () =>
    createElement("section", { "data-memory-sync-panel": "" }),
}));

class MemoryStorageAdapter implements StorageAdapter {
  readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.data.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }
}

let harness: E2eSyncHarness | null = null;
let root: Root | null = null;

afterEach(async () => {
  await act(async () => {
    root?.unmount();
    await flushPromises();
  });
  root = null;
  document.body.replaceChildren();
  await harness?.cleanup();
  harness = null;
});

describe("CaptureSurface remote sync invalidation", () => {
  it("re-reads IndexedDB after PullCoordinator applies remote captures and emits sync invalidation", async () => {
    harness = await createE2eSyncHarness();
    const { deviceA, deviceB, workspaceId } = harness;
    const container = await harness.runOnDevice(deviceB, async () =>
      renderDeviceBCaptureSurface(harness!),
    );

    await changeEditor(container, "mitcom");
    await advanceTime(500);

    expect(container.querySelector("[data-canvas-rail-badge]")).toBeNull();
    expect(container.textContent).not.toContain("Mitcom movil 1");

    const remoteCaptures = [1, 2, 3].map((position) =>
      makeNode({
        workspaceId,
        deviceId: deviceA.device.id,
        content: `Mitcom movil ${position}`,
      }),
    );
    const notebookPending = makeNode({
      workspaceId,
      deviceId: deviceB.device.id,
      content: "Captura local pendiente del notebook",
    });

    await harness.runOnDevice(deviceA, async () => {
      for (const capture of remoteCaptures) {
        await deviceA.repositories.nodeRepository.create(capture);
      }
      expect(await getOutboxRecords()).toHaveLength(3);
    });
    await expect(
      harness.runOnDevice(deviceA, () => deviceA.pushCoordinator.run()),
    ).resolves.toMatchObject({ status: "SUCCESS", pushed: 3 });

    await harness.runOnDevice(deviceB, async () => {
      await deviceB.repositories.nodeRepository.create(notebookPending);
      expect(await getOutboxRecords()).toHaveLength(1);
    });

    const notebookInitialSync = createAutomaticSyncOrchestrator({
      pushCoordinator: deviceB.pushCoordinator,
      pullCoordinator: deviceB.pullCoordinator,
      config: { runOnStart: false },
    });
    await expect(
      harness.runOnDevice(deviceB, () => notebookInitialSync.syncNow()),
    ).resolves.toMatchObject({
      status: "SUCCESS",
      pushResult: { pushed: 1 },
      pullResult: { pulled: 4, applied: 3 },
    });

    await harness.runOnDevice(deviceB, async () => {
      const snapshot = await snapshotDevice(workspaceId);
      expect(snapshot.nodes.map((node) => node.content).sort()).toEqual([
        "Captura local pendiente del notebook",
        "Mitcom movil 1",
        "Mitcom movil 2",
        "Mitcom movil 3",
      ]);
      expect(await getOutboxRecords()).toHaveLength(0);
      expect(await getPullCursor(workspaceId, deviceB.device.id)).toBe("4");
    });

    await harness.runOnDevice(deviceB, async () => {
      await advanceTime(500);
      expect(container.querySelector("[data-canvas-rail-badge]")).toBeDefined();
      await openMemoryPanel(container);
      expect(container.textContent).toContain("Mitcom movil 1");
    });
  });
});

async function renderDeviceBCaptureSurface(harness: E2eSyncHarness) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      createElement(CaptureSurface, {
        device: harness.deviceB.device,
        workspace: {
          id: harness.workspaceId,
          name: "Personal",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        storage: new MemoryStorageAdapter(),
        repositories: harness.deviceB.repositories,
      }),
    );
    await flushPromises();
  });

  return container;
}

async function changeEditor(container: HTMLElement, value: string) {
  const editor = getEditor(container);

  await act(async () => {
    setNativeValue(editor, value);
    editor.dispatchEvent(
      new CustomEvent("vinema:set-rich-editor-markdown", {
        bubbles: true,
        detail: { markdown: value },
      }),
    );
    await flushPromises();
  });
}

function getEditor(container: HTMLElement) {
  const editor = container.querySelector<HTMLElement>(
    "[data-canvas-rich-editor-content]",
  );

  if (!editor) {
    throw new Error("Editor not found");
  }

  if (!("value" in editor)) {
    Object.defineProperty(editor, "value", {
      configurable: true,
      get() {
        return editor.textContent ?? "";
      },
      set(nextValue: string) {
        editor.textContent = nextValue;
      },
    });
  }

  return editor as HTMLElement & { value: string };
}

function setNativeValue(element: HTMLElement & { value: string }, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(element, "value");
  descriptor?.set?.call(element, value);
}

async function openMemoryPanel(container: HTMLElement) {
  const button = Array.from(container.querySelectorAll("button")).find((item) =>
    item.getAttribute("aria-label")?.includes("Memorias sugeridas"),
  );

  if (!button) {
    throw new Error("Memory panel button not found");
  }

  await act(async () => {
    (button as HTMLButtonElement).click();
    await flushPromises();
  });
}

async function advanceTime(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await flushPromises();
  });
}

async function flushPromises() {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}
