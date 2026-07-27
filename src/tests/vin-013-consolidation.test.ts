import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import InboxPage from "@/app/inbox/page";
import NewNotePage from "@/app/notes/new/page";
import { SidebarContent } from "@/components/app-shell/app-sidebar";
import type { Node } from "@/domain/node/node";
import { listKnowledgeCaptures } from "@/features/capture/list-knowledge-captures";
import { InMemoryNodeRepository } from "@/tests/fakes/in-memory-node-repository";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace,
  }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("VIN-013 consolidation", () => {
  afterEach(() => {
    replace.mockClear();
    document.body.replaceChildren();
  });

  it("keeps the main navigation focused on Inicio and Historial", async () => {
    const screen = await renderElement(
      createElement(SidebarContent, { pathname: "/" }),
    );

    expect(screen.textContent).toContain("Inicio");
    expect(screen.textContent).toContain("Historial");
    expect(screen.textContent).not.toContain("Buscar");
    expect(screen.textContent).not.toContain("Inbox");
    expect(screen.textContent).not.toContain("Nueva nota");
    expect(screen.textContent).not.toContain("Areas");
    expect(screen.textContent).not.toContain("Proyectos");
    expect(screen.textContent).not.toContain("Personas");
  });

  it("keeps active historical captures visible without requiring organization", async () => {
    const repository = new InMemoryNodeRepository([
      createNode({
        id: "idea-1",
        content: "Captura historica pendiente",
        organizationStatus: "INBOX",
        type: "IDEA",
        updatedAt: "2026-01-03T00:00:00.000Z",
      }),
      createNode({
        id: "capture-1",
        content: "Captura principal",
        organizationStatus: "ORGANIZED",
        type: "NOTE",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }),
      createNode({
        id: "archived-1",
        content: "Captura archivada",
        organizationStatus: "ORGANIZED",
        type: "NOTE",
        status: "ARCHIVED",
        updatedAt: "2026-01-04T00:00:00.000Z",
      }),
    ]);

    const captures = await listKnowledgeCaptures(repository, {
      workspaceId: "workspace-1",
    });

    expect(captures.map((capture) => capture.id)).toEqual([
      "idea-1",
      "capture-1",
    ]);
  });

  it("redirects legacy creation surfaces to the writing entry point", async () => {
    const newNote = await renderElement(createElement(NewNotePage));

    expect(newNote.textContent).toContain("Inicio");
    expect(newNote.querySelector("a")?.getAttribute("href")).toBe("/");
    expect(replace).toHaveBeenCalledWith("/");

    replace.mockClear();
    const inbox = await renderElement(createElement(InboxPage));

    expect(inbox.textContent).toContain("Inicio");
    expect(inbox.querySelector("a")?.getAttribute("href")).toBe("/");
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("removes legacy creation calls from the visible source flow", () => {
    const source = [
      readSourceTree("src/app"),
      readSourceTree("src/components"),
    ].join("\n");

    expect(source).not.toContain("Nueva nota");
    expect(source).not.toContain("Crear una nota");
    expect(source).not.toContain("Crear nueva nota");
  });
});

async function renderElement(element: ReactElement) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);

  await act(async () => {
    createRoot(container).render(element);
    await Promise.resolve();
  });

  return container;
}

function createNode({
  id,
  content,
  organizationStatus,
  type,
  updatedAt,
  status = "ACTIVE",
}: {
  id: string;
  content: string;
  organizationStatus: Node["organizationStatus"];
  type: Node["type"];
  updatedAt: string;
  status?: Node["status"];
}): Node {
  return {
    id,
    workspaceId: "workspace-1",
    type,
    content,
    status,
    organizationStatus,
    metadata: {},
    version: 1,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
    createdByDeviceId: "device-1",
    lastModifiedByDeviceId: "device-1",
  };
}

function readSourceTree(relativePath: string): string {
  const absolutePath = join(process.cwd(), relativePath);
  const stat = statSync(absolutePath);

  if (stat.isFile()) {
    return readFileSync(absolutePath, "utf8");
  }

  return readdirSync(absolutePath)
    .map((entry) => readSourceTree(join(relativePath, entry)))
    .join("\n");
}
