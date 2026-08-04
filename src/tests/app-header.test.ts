import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppHeader } from "@/components/app-shell/app-header";

const knowledgeMocks = vi.hoisted(() => ({
  downloadKnowledgeBackup: vi.fn(),
  exportKnowledgeBackup: vi.fn(),
  push: vi.fn(),
  readKnowledgeBackupFile: vi.fn(),
  replace: vi.fn(),
  resetKnowledge: vi.fn(),
  summarizeLocalKnowledge: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: knowledgeMocks.push,
    replace: knowledgeMocks.replace,
  }),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    user: { email: "user@example.test", displayName: "User" },
    isAuthenticated: true,
    workspaceId: "workspace-1",
    deviceId: "device-1",
    accessToken: "access-token",
    syncState: {
      lifecycle: "STARTED",
      phase: "IDLE",
      connectivity: "ONLINE",
      authentication: "AUTHENTICATED",
      pendingMutations: 0,
      processingMutations: 0,
      failedMutations: 0,
      conflictCount: 0,
      lastRunStartedAt: null,
      lastRunFinishedAt: null,
      lastSuccessfulSyncAt: null,
      nextRunAt: null,
      lastError: null,
    },
    syncNow: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@/features/node/hooks/use-vinema-context", () => ({
  useVinemaContext: () => ({
    status: "ready",
    workspace: {
      id: "workspace-1",
      name: "Personal",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    device: {
      id: "device-1",
      workspaceId: "workspace-1",
      name: "Vinema Web",
      platform: "WEB",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    error: null,
  }),
}));

vi.mock("@/features/auth/public-api-url", () => ({
  getPublicApiUrl: () => "http://localhost:8000",
}));

vi.mock("@/features/feedback/visual-feedback-provider", () => ({
  VisualFeedbackWordmark: () =>
    createElement("span", { "data-vinema-brand": "monogram" }),
  useVisualFeedback: () => ({
    saving: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/features/knowledge-backup/knowledge-backup", () => {
  class KnowledgeBackupValidationError extends Error {}
  class KnowledgeRestoreConflictError extends Error {}

  return {
    KnowledgeBackupValidationError,
    KnowledgeRestoreConflictError,
    exportKnowledgeBackup: knowledgeMocks.exportKnowledgeBackup,
    restoreKnowledgeBackup: vi.fn(async () => ({
      createdNodes: 1,
      createdContexts: 0,
      createdRelations: 0,
    })),
  };
});

vi.mock("@/features/knowledge-backup/knowledge-backup-browser", () => ({
  downloadKnowledgeBackup: knowledgeMocks.downloadKnowledgeBackup,
  readKnowledgeBackupFile: knowledgeMocks.readKnowledgeBackupFile,
}));

vi.mock("@/features/knowledge-reset/knowledge-reset", () => {
  class KnowledgeResetError extends Error {}

  return {
    KNOWLEDGE_RESET_CONFIRMATION: "VACIAR",
    KnowledgeResetError,
    resetKnowledge: knowledgeMocks.resetKnowledge,
    summarizeLocalKnowledge: knowledgeMocks.summarizeLocalKnowledge,
  };
});

vi.mock("@/features/knowledge-reset/knowledge-reset-client", () => ({
  createKnowledgeResetClient: () => ({
    reset: vi.fn(),
  }),
}));

vi.mock("@/infrastructure/repositories", () => ({
  contextRepository: {},
  createLocalSyncRepositorySet: () => ({
    nodeRepository: {},
    contextRepository: {},
    nodeContextRelationRepository: {},
  }),
  nodeContextRelationRepository: {},
  nodeRepository: {},
  storageAdapter: {},
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let mountedRoot: Root | null = null;

describe("AppHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    knowledgeMocks.summarizeLocalKnowledge.mockResolvedValue({
      nodes: 22,
      contexts: 6,
      relations: 15,
    });
    knowledgeMocks.exportKnowledgeBackup.mockResolvedValue(backupFixture());
    knowledgeMocks.push.mockReset();
    knowledgeMocks.readKnowledgeBackupFile.mockResolvedValue(backupFixture());
    knowledgeMocks.replace.mockReset();
    knowledgeMocks.resetKnowledge.mockResolvedValue({
      remote: {
        workspaceId: "workspace-1",
        resetVersion: "10",
        occurredAt: "2026-01-01T00:00:00.000Z",
        deleted: { captures: 22, concepts: 6, relations: 15 },
      },
      local: { nodes: 22, contexts: 6, relations: 15 },
    });
  });

  afterEach(async () => {
    if (mountedRoot) {
      await act(async () => {
        mountedRoot?.unmount();
        mountedRoot = null;
        await flushPromises();
      });
    }
    document.body.replaceChildren();
  });

  it("separates knowledge navigation from administration in the session menu", async () => {
    const screen = await renderHeader();
    const header = screen.querySelector("header");
    const wordmarkTrigger = screen.querySelector(
      "button[aria-label='Abrir Estado de la memoria']",
    );

    expect(header?.className).toContain("grid-cols-[1fr_auto_1fr]");
    expect(wordmarkTrigger?.getAttribute("data-memory-sync-trigger")).toBe("");
    expect(screen.querySelector("a[aria-label='Vinema']")?.getAttribute("href")).toBe("/");
    expect(screen.querySelector("[data-vinema-brand='monogram']")).toBeTruthy();
    expect(header?.textContent).not.toContain("VN");
    expect(wordmarkTrigger?.textContent).not.toBe("V");
    expect(wordmarkTrigger?.textContent).not.toContain("VA");
    expect(screen.querySelector("nav[aria-label='Navegacion principal']")).toBeNull();
    expect(screen.querySelector("a[aria-label='Explorar']")).toBeNull();
    expect(screen.textContent).not.toContain("Explorar");
    expect(screen.textContent).not.toContain("Base de conocimiento");

    await click(screen.querySelector("button[aria-label='Abrir menu']"));

    expect(document.body.textContent).toContain("Conocimiento");
    expect(document.body.querySelector("a[href='/']")).toBeTruthy();
    expect(document.body.querySelector("a[href='/memory']")).toBeTruthy();
    expect(document.body.querySelector("a[href='/concepts']")).toBeTruthy();
    expect(document.body.textContent).toContain("Explorar memoria");
    expect(document.body.textContent).toContain("Conceptos");
    expect(document.body.textContent).toContain("Administrar");
    expect(document.body.textContent).not.toContain("Mi conocimiento");
    expect(document.body.textContent).toContain("Cerrar sesion");
    expect(document.body.querySelector("a[href='/notes']")).toBeNull();
    expect(document.body.querySelector("a[href='/notes/archive']")).toBeNull();
    expect(document.body.querySelector("a[aria-label='Explorar']")).toBeNull();
    expect(document.body.textContent).not.toContain("Exportar memoria");
    expect(document.body.textContent).not.toContain("Importar memoria");
    expect(document.body.textContent).not.toContain("Vaciar memoria");
    expect(document.body.textContent).not.toContain("Sincronizacion futura");

    await click(getByText("Administrar"));

    expect(getDialog()).toBeTruthy();
    expect(document.body.textContent).toContain("Conocimiento");
    expect(document.body.textContent).toContain("Exportar memoria");
    expect(document.body.textContent).toContain("Importar memoria");
    expect(document.body.textContent).toContain("Vaciar memoria");
    expect(document.body.textContent).not.toContain("22 capturas · 6 conceptos · 15 relaciones");
    expect(document.body.querySelector("a[aria-label='Explorar']")).toBeNull();
    expect(document.body.textContent).not.toContain("workspace");
  });

  it("navigates directly to Explorar memoria and Conceptos from the knowledge menu", async () => {
    const screen = await renderHeader();

    await click(screen.querySelector("button[aria-label='Abrir menu']"));

    expect(document.body.querySelector("a[href='/memory']")?.textContent).toContain(
      "Explorar memoria",
    );
    expect(document.body.querySelector("a[href='/concepts']")?.textContent).toContain(
      "Conceptos",
    );
  });

  it("renders the center as a responsive portal with internal scrolling", async () => {
    const screen = await renderHeader();

    await click(screen.querySelector("button[aria-label='Abrir menu']"));
    await click(getByText("Administrar"));

    const dialog = getDialog();
    expect(document.body.contains(dialog)).toBe(true);
    expect(dialog.className).toContain("w-[calc(100vw-24px)]");
    expect(dialog.className).toContain("max-h-[calc(100dvh-24px)]");
    expect(dialog.className).toContain("overflow-hidden");
    expect(dialog.querySelector(".overflow-y-auto")).toBeTruthy();
  });

  it("keeps export in the center and reuses the existing download flow", async () => {
    const screen = await renderHeader();

    await click(screen.querySelector("button[aria-label='Abrir menu']"));
    await click(getByText("Administrar"));
    await click(getByText("Exportar memoria"));

    expect(knowledgeMocks.exportKnowledgeBackup).toHaveBeenCalledTimes(1);
    expect(knowledgeMocks.downloadKnowledgeBackup).toHaveBeenCalledWith(
      backupFixture(),
    );
    expect(getDialog()).toBeTruthy();
  });

  it("opens restore confirmation inside the same center without stacking dialogs", async () => {
    const screen = await renderHeader();

    await click(screen.querySelector("button[aria-label='Abrir menu']"));
    await click(getByText("Administrar"));
    await click(getByText("Importar memoria"));
    await changeFileInput(new File(["{}"], "vinema-knowledge.json", {
      type: "application/json",
    }));

    expect(knowledgeMocks.readKnowledgeBackupFile).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("vinema-knowledge.json");
    expect(document.body.textContent).toContain("Restaurar");
    expect(document.body.querySelectorAll("[role='dialog']")).toHaveLength(1);
  });

  it("opens reset confirmation responsively and requires VACIAR", async () => {
    const screen = await renderHeader();

    await click(screen.querySelector("button[aria-label='Abrir menu']"));
    await click(getByText("Administrar"));
    await click(getByText("Vaciar memoria"));

    expect(document.body.textContent).toContain(
      "Se eliminara toda la memoria activa en todos tus dispositivos.",
    );
    expect(getButtonByText("Vaciar memoria").hasAttribute("disabled")).toBe(true);

    await inputText(getConfirmationInput(), "BORRAR");
    expect(getButtonByText("Vaciar memoria").hasAttribute("disabled")).toBe(true);

    await inputText(getConfirmationInput(), "VACIAR");
    expect(getButtonByText("Vaciar memoria").hasAttribute("disabled")).toBe(false);
    expect(document.body.querySelectorAll("[role='dialog']")).toHaveLength(1);
  });

  it("cleans transient reset state when the center is closed", async () => {
    const screen = await renderHeader();

    await click(screen.querySelector("button[aria-label='Abrir menu']"));
    await click(getByText("Administrar"));
    await click(getByText("Vaciar memoria"));
    await inputText(getConfirmationInput(), "VACIAR");
    await click(document.body.querySelector("button[aria-label='Cerrar Conocimiento']"));

    expect(document.body.querySelector("[role='dialog']")).toBeNull();

    await click(screen.querySelector("button[aria-label='Abrir menu']"));
    if (!document.body.textContent?.includes("Conocimiento")) {
      await click(screen.querySelector("button[aria-label='Abrir menu']"));
    }
    await click(getByText("Administrar"));
    await click(getByText("Vaciar memoria"));

    expect(getConfirmationInput().value).toBe("");
  });
});

async function renderHeader() {
  const container = document.createElement("div");
  document.body.replaceChildren(container);

  await act(async () => {
    mountedRoot = createRoot(container);
    mountedRoot.render(
      createElement(AppHeader, {
        pathname: "/",
        onFocusWriting: vi.fn(),
      }),
    );
    await flushPromises();
  });

  return container;
}

async function click(element: Element | null) {
  if (!(element instanceof HTMLElement)) {
    throw new Error("Expected clickable element.");
  }

  await act(async () => {
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
  });
}

async function inputText(element: Element | null, value: string) {
  if (!(element instanceof HTMLInputElement)) {
    throw new Error("Expected input element.");
  }

  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    await flushPromises();
  });
}

async function changeFileInput(file: File) {
  const input = document.body.querySelector(
    "input[aria-label='Seleccionar respaldo de conocimiento']",
  );
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected file input.");
  }

  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file],
  });

  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flushPromises();
  });
}

function getDialog() {
  const dialog = document.body.querySelector("[role='dialog']");
  if (!(dialog instanceof HTMLElement)) {
    throw new Error("Expected dialog.");
  }

  return dialog;
}

function getByText(text: string) {
  const element = Array.from(document.body.querySelectorAll("*")).find(
    (candidate) => candidate.textContent === text,
  );
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Could not find text: ${text}`);
  }

  return element;
}

function getButtonByText(text: string) {
  const element = Array.from(document.body.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Could not find button: ${text}`);
  }

  return element;
}

function getConfirmationInput() {
  const element = Array.from(document.body.querySelectorAll("input")).find(
    (input) => input.getAttribute("type") !== "file",
  );
  if (!(element instanceof HTMLInputElement)) {
    throw new Error("Could not find confirmation input.");
  }

  return element;
}

function backupFixture() {
  return {
    format: "vinema-knowledge-backup",
    version: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    workspace: {
      id: "workspace-1",
      name: "Personal",
    },
    knowledge: {
      nodes: [],
      contexts: [],
      relations: [],
    },
    summary: {
      nodes: 22,
      contexts: 6,
      relations: 15,
    },
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
