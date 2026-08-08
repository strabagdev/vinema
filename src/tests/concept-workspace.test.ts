import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConceptWorkspaceClient } from "@/app/concepts/concept-workspace-client";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";

const mocks = vi.hoisted(() => ({
  contexts: new Map<string, Context>(),
  nodes: new Map<string, Node>(),
  relations: new Map<string, NodeContextRelation>(),
  push: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  vinemaContext: {
    status: "ready",
    workspace: { id: "workspace-1", name: "Personal" },
    device: { id: "device-1" },
    error: null,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    back: vi.fn(),
  }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/features/node/hooks/use-vinema-context", () => ({
  useVinemaContext: () => mocks.vinemaContext,
}));

vi.mock("@/infrastructure/repositories", () => ({
  contextRepository: {
    getById: vi.fn(async (id: string) => mocks.contexts.get(id) ?? null),
    list: vi.fn(async ({ workspaceId }: { workspaceId: string }) =>
      Array.from(mocks.contexts.values()).filter(
        (context) =>
          context.workspaceId === workspaceId && context.archivedAt === null,
      ),
    ),
  },
  nodeContextRelationRepository: {
    listByNodeId: vi.fn(async (nodeId: string) =>
      Array.from(mocks.relations.values()).filter(
        (relation) => relation.nodeId === nodeId,
      ),
    ),
    listByWorkspace: vi.fn(async (workspaceId: string) =>
      Array.from(mocks.relations.values()).filter(
        (relation) => relation.workspaceId === workspaceId,
      ),
    ),
  },
  nodeRepository: {
    listByWorkspace: vi.fn(async (workspaceId: string) =>
      Array.from(mocks.nodes.values()).filter(
        (node) => node.workspaceId === workspaceId && node.deletedAt === null,
      ),
    ),
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("ConceptWorkspaceClient", () => {
  beforeEach(() => {
    mocks.contexts.clear();
    mocks.nodes.clear();
    mocks.relations.clear();
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.searchParams = new URLSearchParams();
    seedWorkspace();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("keeps concepts and map in one synchronized workspace", async () => {
    const onClose = vi.fn();
    const screen = await renderConceptWorkspace({ onClose });

    expect(screen.querySelector("[data-concept-workspace]")).toBeTruthy();
    const topbar = screen.querySelector("[data-concept-workspace-topbar]");
    expect(topbar).toBeTruthy();
    expect(topbar?.textContent).toContain("Conceptos");
    expect(topbar?.querySelector("#concept-workspace-search")).toBeTruthy();
    expect(topbar?.querySelector("[data-concept-carousel]")).toBeTruthy();
    expect(topbar?.querySelector("[aria-label='Cerrar Conceptos']")).toBeTruthy();
    expect(screen.querySelector("[data-concept-workspace-carousel]")).toBeNull();
    expect(screen.querySelector("[data-concept-workspace-main]")).toBeTruthy();
    expect(screen.querySelector("[data-concept-carousel]")).toBeTruthy();
    expect(screen.querySelector("[data-concept-index-list]")).toBeNull();
    expect(screen.querySelector("[data-concept-workspace-map]")).toBeTruthy();
    expect(screen.querySelector("[data-concept-workspace-profile]")).toBeTruthy();
    expect(screen.querySelector("[data-knowledge-explorer-canvas]")).toBeTruthy();
    expect(screen.querySelector("[data-concept-workspace]")?.className).toContain(
      "grid-rows-[auto_auto_minmax(0,1fr)]",
    );
    expect(screen.querySelector("[data-concept-workspace-main]")?.className).toContain(
      "xl:grid-cols-[minmax(20rem,40%)_minmax(0,60%)]",
    );
    expect(screen.querySelector("[data-concept-workspace]")?.className).toContain(
      "overflow-hidden",
    );
    expect(screen.textContent).not.toContain("Abrir mapa de conceptos");
    expect(screen.textContent).not.toContain("Explorar conocimiento");
    expect(screen.querySelector("[data-concept-carousel]")?.textContent).toBe(
      "RailwaySync",
    );
    expect(screen.querySelector("[data-concept-carousel]")?.textContent)
      .not.toContain("recuerdo relacionado");

    await click(getButtonContaining(screen, "Railway"));

    const profile = screen.querySelector("[data-concept-workspace-profile]");

    expect(profile).toBeTruthy();
    expect(getButtonContaining(screen, "Railway").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(profile?.textContent).toContain("Railway");
    expect(profile?.textContent).toContain("2 recuerdos · 1 conexión");
    expect(profile?.textContent).toContain("Relaciones");
    expect(profile?.textContent).toContain("Recuerdos");
    expect(profile?.textContent).not.toContain("Perfil");
    expect(profile?.textContent).not.toContain("Perfil vivo");
    expect(profile?.textContent).not.toContain("Activo");
    expect(screen.querySelector("[data-concept-profile-workspace]")?.className)
      .toContain("overflow-y-auto");
    expect(screen.querySelector("[data-concept-workspace-map]")).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();

    await click(topbar?.querySelector("[aria-label='Cerrar Conceptos']") as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);

    await click(screen.querySelector("[aria-label='Enfocar Sync']") as HTMLElement);

    expect(screen.textContent).toContain("Sync");
    expect(getButtonContaining(screen, "Sync").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(
      screen.querySelector("[data-concept-carousel-item-active='true']")?.textContent,
    ).toBe("Sync");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("keeps concept search and carousel horizontally navigable", async () => {
    const screen = await renderConceptWorkspace();
    const input = screen.querySelector("#concept-workspace-search") as HTMLInputElement;
    const carousel = screen.querySelector("[data-concept-carousel]") as HTMLElement;

    expect(input).toBeTruthy();
    expect(carousel.className).toContain("overflow-x-auto");

    await changeInput(input, "syn");

    expect(carousel.textContent).toBe("Sync");
    expect(carousel.textContent).not.toContain("Railway");

    const initialScroll = carousel.scrollLeft;
    await wheel(carousel, 120, { clientX: 420, clientY: 48 });
    expect(carousel.scrollLeft).toBeGreaterThanOrEqual(initialScroll);
  });

  it("shows description and aliases only when the selected concept has them", async () => {
    mocks.contexts.set(
      "railway",
      context({
        id: "railway",
        name: "Railway",
        description: "Infraestructura para desplegar servicios.",
        aliases: ["Railway Cloud"],
        normalizedAliases: ["railway cloud"],
      }),
    );
    const screen = await renderConceptWorkspace({ initialConceptId: "railway" });
    const profile = screen.querySelector("[data-concept-workspace-profile]") as HTMLElement;

    expect(profile.textContent).toContain("Infraestructura para desplegar servicios.");
    expect(profile.textContent).toContain("También aparece como");
    expect(profile.textContent).toContain("Railway Cloud");
    expect(profile.textContent).not.toContain("railway cloud");
    expect(profile.textContent).not.toContain(
      "Concepto emergente confirmado desde la captura actual",
    );

    await click(getButtonContaining(screen, "Sync"));

    const nextProfile = screen.querySelector("[data-concept-workspace-profile]") as HTMLElement;
    expect(nextProfile.textContent).not.toContain("También aparece como");
    expect(nextProfile.textContent).not.toContain(
      "Infraestructura para desplegar servicios.",
    );
  });

  it("navigates relations and opens memories inside the workspace without changing routes", async () => {
    const openMemory = vi.fn();
    const screen = await renderConceptWorkspace({ onOpenMemory: openMemory });

    await click(getButtonContaining(screen, "Railway"));

    const profile = screen.querySelector("[data-concept-workspace-profile]") as HTMLElement;
    await click(getButtonContaining(profile, "Sync"));

    expect(getButtonContaining(screen, "Sync").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.querySelector("[data-concept-workspace-map]")).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();

    const nextProfile = screen.querySelector("[data-concept-workspace-profile]") as HTMLElement;
    await click(getButtonContaining(nextProfile, "Captura sobre Railway y Sync"));

    expect(openMemory).toHaveBeenCalledWith("a");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("limits representative memories by default and expands them in place", async () => {
    seedRepresentativeMemoryList();
    const screen = await renderConceptWorkspace({ initialConceptId: "railway" });
    const profile = screen.querySelector("[data-concept-workspace-profile]") as HTMLElement;
    const memories = profile.querySelector("section[aria-label='Recuerdos']") as HTMLElement;

    expect(countInteractiveItemsContaining(memories, "Captura representativa")).toBe(2);
    expect(memories.textContent).toContain("Ver los 4 recuerdos");

    await click(getButtonContaining(memories, "Ver los 4 recuerdos"));

    expect(countInteractiveItemsContaining(memories, "Captura representativa")).toBe(4);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("shows a bounded two-level concept map with convergences", async () => {
    seedSecondLevelGraph();
    const screen = await renderConceptWorkspace();

    await click(getButtonContaining(screen, "Railway"));

    expect(screen.querySelectorAll("[data-concept-graph-node-level='0']")).toHaveLength(1);
    expect(screen.querySelectorAll("[data-concept-graph-node-level='1']").length)
      .toBeGreaterThanOrEqual(2);
    expect(screen.querySelectorAll("[data-concept-graph-node-level='2']").length)
      .toBeGreaterThan(0);
    expect(screen.querySelectorAll("[data-concept-graph-node-level='3']")).toHaveLength(0);
    expect(screen.querySelectorAll("[aria-label='Enfocar Seguridad']")).toHaveLength(1);
    expect(
      screen.querySelectorAll(
        "[data-concept-graph-edge-level='2'][data-concept-graph-edge-source='sync']",
      ).length,
    ).toBeLessThanOrEqual(4);
    expect(screen.querySelector("[data-concept-graph-hidden-count]")?.textContent)
      .toContain("+");

    await click(screen.querySelector("[aria-label='Enfocar Deploy']") as HTMLElement);

    expect(getButtonContaining(screen, "Deploy").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.querySelector("[data-concept-workspace-profile]")?.textContent)
      .toContain("Deploy");
    expect(screen.querySelector("[data-concept-workspace-map]")).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("supports spatial map interactions without changing the route", async () => {
    seedSecondLevelGraph();
    const screen = await renderConceptWorkspace();

    await click(getButtonContaining(screen, "Railway"));

    const svg = screen.querySelector(
      "svg[aria-label='Mapa de conceptos conectados']",
    ) as SVGSVGElement;
    const syncNode = screen.querySelector("[aria-label='Enfocar Sync']") as SVGGElement;
    const syncCircle = syncNode.querySelector("circle") as SVGCircleElement;
    const initialTransform = svg.getAttribute("data-concept-graph-transform");
    const initialX = syncCircle.getAttribute("cx");

    mockSvgRect(svg);

    await wheel(svg, -120, { clientX: 520, clientY: 220 });
    expect(svg.getAttribute("data-concept-graph-transform")).not.toBe(initialTransform);

    const zoomedTransform = svg.getAttribute("data-concept-graph-transform");
    await drag(svg, {
      from: { clientX: 260, clientY: 180 },
      to: { clientX: 310, clientY: 210 },
    });
    expect(svg.getAttribute("data-concept-graph-transform")).not.toBe(zoomedTransform);

    await drag(syncNode, {
      from: { clientX: 480, clientY: 160 },
      to: { clientX: 560, clientY: 240 },
    });
    expect(syncCircle.getAttribute("cx")).not.toBe(initialX);

    await act(async () => {
      syncNode.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await flushPromises();
    });
    expect(
      (screen.querySelector("[aria-label='Enfocar Sync'] circle") as SVGCircleElement)
        .getAttribute("r"),
    ).not.toBe("24");

    await doubleClick(screen.querySelector("[aria-label='Enfocar Deploy']") as HTMLElement);
    expect(getButtonContaining(screen, "Deploy").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(mocks.push).not.toHaveBeenCalled();

    await click(getButtonContaining(screen, "centrar"));
    expect(svg.getAttribute("data-concept-graph-transform")).toBe("1.00,0,0");
  });

  it("does not fabricate second-level nodes when the selected concept has few links", async () => {
    const screen = await renderConceptWorkspace();

    await click(getButtonContaining(screen, "Railway"));

    expect(screen.querySelectorAll("[data-concept-graph-node-level='1']")).toHaveLength(1);
    expect(screen.querySelectorAll("[data-concept-graph-node-level='2']")).toHaveLength(0);
    expect(screen.querySelector("[data-concept-graph-hidden-count]")).toBeNull();
  });

  it("shows exceptional concept status but keeps normal status implicit", async () => {
    mocks.contexts.set(
      "archived",
      context({
        id: "archived",
        name: "Concepto archivado",
        archivedAt: "2026-08-01T00:00:00.000Z",
      }),
    );
    const screen = await renderConceptWorkspace({ initialConceptId: "archived" });
    const profile = screen.querySelector("[data-concept-workspace-profile]");

    expect(profile?.textContent).toContain("Concepto archivado");
    expect(profile?.textContent).not.toContain("Archivado");
    expect(profile?.textContent).not.toContain("Activo");
    expect(profile?.textContent).not.toContain("Perfil vivo");
    expect(profile?.textContent).not.toContain("Primera aparición");
    expect(profile?.textContent).not.toContain("Última actividad");
  });
});

async function renderConceptWorkspace({
  initialConceptId,
  onOpenMemory,
  onClose,
}: {
  initialConceptId?: string | null;
  onOpenMemory?: (nodeId: string) => void;
  onClose?: () => void;
} = {}) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);

  await act(async () => {
    createRoot(container).render(
      createElement(ConceptWorkspaceClient, { initialConceptId, onOpenMemory, onClose }),
    );
    await flushPromises();
  });

  return container;
}

function seedRepresentativeMemoryList() {
  mocks.nodes.clear();
  mocks.relations.clear();

  for (let index = 1; index <= 4; index += 1) {
    const nodeId = `representative-${index}`;
    mocks.nodes.set(
      nodeId,
      node({
        id: nodeId,
        content: `Captura representativa ${index}`,
        createdAt: `2026-01-0${index}T00:00:00.000Z`,
        updatedAt: `2026-01-0${index}T00:00:00.000Z`,
      }),
    );
    mocks.relations.set(
      `${nodeId}-railway`,
      relation({ id: `${nodeId}-railway`, nodeId, contextId: "railway" }),
    );
  }
}

function seedWorkspace() {
  [
    context({ id: "railway", name: "Railway" }),
    context({ id: "sync", name: "Sync" }),
  ].forEach((item) => mocks.contexts.set(item.id, item));
  [
    node({ id: "a", content: "Captura sobre Railway y Sync" }),
    node({ id: "b", content: "Otra captura sobre Railway y Sync" }),
  ].forEach((item) => mocks.nodes.set(item.id, item));
  [
    relation({ id: "a-railway", nodeId: "a", contextId: "railway" }),
    relation({ id: "a-sync", nodeId: "a", contextId: "sync" }),
    relation({ id: "b-railway", nodeId: "b", contextId: "railway" }),
    relation({ id: "b-sync", nodeId: "b", contextId: "sync" }),
  ].forEach((item) => mocks.relations.set(item.id, item));
}

function seedSecondLevelGraph() {
  [
    context({ id: "workspace", name: "Workspace" }),
    context({ id: "deploy", name: "Deploy" }),
    context({ id: "security", name: "Seguridad" }),
    context({ id: "billing", name: "Billing" }),
    context({ id: "qa", name: "QA" }),
    context({ id: "ops", name: "Operaciones" }),
  ].forEach((item) => mocks.contexts.set(item.id, item));
  [
    node({ id: "i", content: "Railway y Workspace comparten base" }),
    node({ id: "c", content: "Sync coordina Deploy" }),
    node({ id: "d", content: "Sync revisa Seguridad" }),
    node({ id: "e", content: "Workspace comparte Seguridad" }),
    node({ id: "f", content: "Sync integra Billing" }),
    node({ id: "g", content: "Sync habilita QA" }),
    node({ id: "h", content: "Sync conversa con Operaciones" }),
  ].forEach((item) => mocks.nodes.set(item.id, item));
  [
    relation({ id: "i-railway", nodeId: "i", contextId: "railway" }),
    relation({ id: "i-workspace", nodeId: "i", contextId: "workspace" }),
    relation({ id: "c-sync", nodeId: "c", contextId: "sync" }),
    relation({ id: "c-deploy", nodeId: "c", contextId: "deploy" }),
    relation({ id: "d-sync", nodeId: "d", contextId: "sync" }),
    relation({ id: "d-security", nodeId: "d", contextId: "security" }),
    relation({ id: "e-workspace", nodeId: "e", contextId: "workspace" }),
    relation({ id: "e-security", nodeId: "e", contextId: "security" }),
    relation({ id: "f-sync", nodeId: "f", contextId: "sync" }),
    relation({ id: "f-billing", nodeId: "f", contextId: "billing" }),
    relation({ id: "g-sync", nodeId: "g", contextId: "sync" }),
    relation({ id: "g-qa", nodeId: "g", contextId: "qa" }),
    relation({ id: "h-sync", nodeId: "h", contextId: "sync" }),
    relation({ id: "h-ops", nodeId: "h", contextId: "ops" }),
  ].forEach((item) => mocks.relations.set(item.id, item));
}

function context(overrides: Partial<Context>): Context {
  return {
    id: "context",
    workspaceId: "workspace-1",
    type: "PROJECT",
    name: "Context",
    description: null,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function node(overrides: Partial<Node>): Node {
  return {
    id: "node",
    workspaceId: "workspace-1",
    type: "NOTE",
    content: "Contenido",
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    createdByDeviceId: "device-1",
    lastModifiedByDeviceId: "device-1",
    ...overrides,
  };
}

function relation(overrides: Partial<NodeContextRelation>): NodeContextRelation {
  return {
    id: "relation",
    workspaceId: "workspace-1",
    nodeId: "node",
    contextId: "context",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function getButtonContaining(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );

  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }

  return button as HTMLButtonElement;
}

function countInteractiveItemsContaining(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button, a")).filter((item) =>
    item.textContent?.includes(text),
  ).length;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
  });
}

async function changeInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await flushPromises();
  });
}

async function doubleClick(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await flushPromises();
  });
}

async function wheel(
  element: Element,
  deltaY: number,
  {
    clientX,
    clientY,
  }: {
    clientX: number;
    clientY: number;
  },
) {
  await act(async () => {
    element.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        deltaY,
      }),
    );
    await flushPromises();
  });
}

async function drag(
  element: Element,
  {
    from,
    to,
  }: {
    from: { clientX: number; clientY: number };
    to: { clientX: number; clientY: number };
  },
) {
  await act(async () => {
    element.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, ...from }),
    );
    await flushPromises();
  });
  await act(async () => {
    element.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, ...to }),
    );
    await flushPromises();
  });
  await act(async () => {
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, ...to }));
    await flushPromises();
  });
}

function mockSvgRect(svg: SVGSVGElement) {
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 760,
      height: 440,
      right: 760,
      bottom: 440,
      toJSON: () => ({}),
    }),
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
