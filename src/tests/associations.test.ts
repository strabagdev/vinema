import { describe, expect, it, vi } from "vitest";
import type { Node } from "@/domain/node/node";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import {
  buildAssociationIndex,
  calculateBm25,
  calculateTfIdfCosine,
  indexCapture,
  suggestAssociations,
} from "@/features/associations/association-engine";
import { normalizeAssociationText } from "@/features/associations/normalize-text";
import { createWordNgrams } from "@/features/associations/ngrams";
import { attachCaptureAssociations } from "@/features/associations/node-associations";
import {
  diagnoseConceptSuggestions,
  MIN_CONCEPT_SCORE,
  suggestConcepts,
} from "@/features/associations/concept-suggestions";
import {
  createConceptEquivalenceKey,
  normalizePersistedConceptLabels,
} from "@/features/associations/concept-label-normalization";
import { evaluateCaptureInput } from "@/features/associations/capture-input-evaluation";
import { tokenizeAssociationText } from "@/features/associations/tokenize";
import {
  countDirectRelations,
  countSharedNeighbors,
  detectLocalCenters,
  getCaptureNeighbors,
} from "@/features/associations/graph-metrics";
import { InMemoryContextRepository } from "@/tests/fakes/in-memory-context-repository";
import { InMemoryNodeRepository } from "@/tests/fakes/in-memory-node-repository";
import { InMemoryNodeContextRelationRepository } from "@/tests/fakes/in-memory-node-context-relation-repository";

describe("association text normalization", () => {
  it("normalizes Spanish text conservatively", () => {
    expect(
      normalizeAssociationText(" Reunión, planificación\nDEL proveedor  "),
    ).toBe("reunion planificacion del proveedor");
    expect(tokenizeAssociationText("las reuniones con planificación")).toEqual([
      "reunion",
      "plan",
    ]);
    expect(tokenizeAssociationText("API Mitcom SQL v2")).toEqual([
      "api",
      "mitcom",
      "sql",
    ]);
    expect(tokenizeAssociationText("")).toEqual([]);
  });

  it("creates word ngrams for relevant tokens", () => {
    expect(createWordNgrams(["base", "conocimiento", "local"], 2)).toEqual([
      "base conocimiento",
      "conocimiento local",
    ]);
    expect(createWordNgrams(["base", "conocimiento", "local"], 3)).toEqual([
      "base conocimiento local",
    ]);
  });
});

describe("association scoring", () => {
  it("BM25 rewards rare terms with saturation and stable order", () => {
    const rare = node({
      id: "rare",
      content: "Mitcom control gestion proveedor",
    });
    const repeated = node({
      id: "repeated",
      content: "control control control gestion",
    });
    const generic = node({
      id: "generic",
      content: "gestion diaria del equipo",
    });
    const index = buildAssociationIndex({ nodes: [rare, repeated, generic] });
    const query = indexCapture(node({ id: "query", content: "Mitcom gestion" }));

    expect(calculateBm25(index, query, index.captures[0])).toBeGreaterThan(
      calculateBm25(index, query, index.captures[1]),
    );
    expect(calculateBm25(index, query, index.captures[1])).toBeGreaterThan(0);
  });

  it("TF-IDF ranks similar captures above common-term captures", () => {
    const similar = node({
      id: "similar",
      content: "planificacion proveedor mitcom soporte",
    });
    const common = node({
      id: "common",
      content: "reunion equipo general seguimiento",
    });
    const index = buildAssociationIndex({ nodes: [similar, common] });
    const query = indexCapture(
      node({ id: "query", content: "planificar soporte mitcom" }),
    );

    expect(calculateTfIdfCosine(index, query, index.captures[0])).toBeGreaterThan(
      calculateTfIdfCosine(index, query, index.captures[1]),
    );
  });

  it("returns explainable suggestions, excludes archived/current and caps results", () => {
    const nodes = [
      node({
        id: "mitcom",
        content: "Reunion de control de gestion con proveedor Mitcom",
      }),
      node({ id: "other", content: "Aprendizaje sobre concentracion profunda" }),
      node({
        id: "archived",
        content: "Mitcom archivado control gestion",
        status: "ARCHIVED",
      }),
      node({ id: "current", content: "borrador actual control gestion" }),
    ];
    const suggestions = suggestAssociations(buildAssociationIndex({ nodes }), {
      text: "Planificar control de gestion con Mitcom",
      currentNodeId: "current",
    });

    expect(suggestions.map((suggestion) => suggestion.node.id)).toEqual(["mitcom"]);
    expect(suggestions[0].score).toBeGreaterThan(0);
    expect(suggestions[0].score).toBeLessThanOrEqual(1);
    expect(suggestions[0].reasons.map((reason) => reason.type)).toContain(
      "PHRASE_MATCH",
    );
  });

  it("finds the controlled meeting and contract examples from VIN-019.1", () => {
    const index = buildAssociationIndex({
      nodes: [
        node({
          id: "a",
          content:
            "Las reuniones extensas reducen mi capacidad de concentración durante la tarde.",
        }),
        node({
          id: "b",
          content:
            "Necesito proteger bloques de trabajo profundo sin interrupciones.",
        }),
        node({
          id: "c",
          content:
            "Revisar el avance semanal del contrato y preparar el informe de gestión.",
        }),
      ],
    });

    expect(
      suggestAssociations(index, {
        text: "Después de muchas reuniones me cuesta concentrarme.",
      }).map((suggestion) => suggestion.node.id),
    ).toContain("a");
    expect(
      suggestAssociations(index, {
        text: "Preparar el avance del contrato para el informe semanal.",
      }).map((suggestion) => suggestion.node.id),
    ).toEqual(["c"]);
  });

  it("keeps selected suggestions visible when they fall outside the strongest matches", () => {
    const nodes = [
      node({ id: "selected", content: "Contrato menor con proveedor antiguo" }),
      ...Array.from({ length: 6 }, (_, index) =>
        node({
          id: `strong-${index}`,
          content: `Preparar avance del contrato informe semanal gestion ${index}`,
        }),
      ),
    ];
    const suggestions = suggestAssociations(buildAssociationIndex({ nodes }), {
      text: "Preparar el avance del contrato para el informe semanal de gestion",
      selectedCaptureIds: ["selected"],
    });

    expect(suggestions.map((suggestion) => suggestion.node.id)).toContain(
      "selected",
    );
    expect(suggestions.length).toBeGreaterThanOrEqual(5);
  });

  it("ignores invalid historical captures and relations without failing", () => {
    const index = buildAssociationIndex({
      nodes: [
        node({
          id: "valid",
          content:
            "Las reuniones extensas reducen mi capacidad de concentración durante la tarde.",
        }),
        {
          ...node({ id: "invalid-content", content: "x" }),
          content: null,
        } as unknown as Node,
        {
          ...node({ id: "", content: "sin id" }),
          id: "",
        },
      ],
      relations: [
        relation("valid", "other"),
        makeLegacyContextRelation(),
        {
          ...relation("a", "b"),
          relatedNodeId: undefined,
        },
      ],
    });

    expect(index.captures.map((capture) => capture.node.id)).toEqual(["valid"]);
    expect(index.relations).toHaveLength(1);
    expect(
      suggestAssociations(index, {
        text: "Después de muchas reuniones me cuesta concentrarme.",
      }).map((suggestion) => suggestion.node.id),
    ).toEqual(["valid"]);
  });

  it("uses selected relations as an additional deterministic signal", () => {
    const relations: NodeContextRelation[] = [
      relation("selected", "candidate"),
    ];
    const suggestions = suggestAssociations(
      buildAssociationIndex({
        nodes: [
          node({ id: "selected", content: "Proveedor Mitcom" }),
          node({ id: "candidate", content: "Reunion con proveedor" }),
        ],
        relations,
      }),
      {
        text: "Seguimiento proveedor",
        selectedCaptureIds: ["selected"],
      },
    );

    const candidate = suggestions.find(
      (suggestion) => suggestion.node.id === "candidate",
    );

    expect(candidate).toBeDefined();
    expect(candidate?.reasons.map((reason) => reason.type)).toContain(
      "SHARED_RELATION",
    );
  });
});

describe("concept suggestions", () => {
  it("uses one semantic evaluation to produce recovery and emerging concepts", () => {
    const nodes = [
      node({ id: "p1", content: "Perfume cuero intenso tipo Ombre Leather" }),
      node({ id: "p2", content: "Perfume cuero ahumado parecido a Rare Carbon" }),
      node({ id: "p3", content: "Perfume cuero para comparar con clones" }),
    ];
    const evaluation = evaluateCaptureInput({
      text: "Busco perfume cuero parecido",
      nodes,
      contexts: [],
      relations: [],
    });
    const emerging = evaluation.conceptSuggestions.find(
      (suggestion) => suggestion.kind === "emerging",
    );

    expect(evaluation.recoveryMatches).toHaveLength(3);
    expect(emerging).toMatchObject({
      kind: "emerging",
      suggestedLabel: "Perfumes",
      evidenceCaptureIds: ["p1", "p2", "p3"],
    });
    expect(evaluation.diagnostics.evidenceCandidateCount).toBe(3);
    expect(evaluation.diagnostics.emergingConceptSuggestionCount).toBe(1);
    expect(evaluation.diagnostics.clusterCount).toBe(1);
  });

  it("preserves repeated exact expressions when labeling emerging concepts", () => {
    const evaluation = evaluateCaptureInput({
      text: "Comparar Rare Carbon con alternativas",
      nodes: [
        node({ id: "rare-1", content: "Rare Carbon tiene salida intensa" }),
        node({ id: "rare-2", content: "Rare Carbon dura bien en invierno" }),
        node({ id: "rare-3", content: "Rare Carbon queda cerca de Ombre Leather" }),
      ],
      contexts: [],
      relations: [],
    });
    const emerging = evaluation.conceptSuggestions.find(
      (suggestion) => suggestion.kind === "emerging",
    );

    expect(emerging).toMatchObject({
      kind: "emerging",
      suggestedLabel: "Rare Carbon",
    });
    expect(
      evaluation.conceptSuggestions.some(
        (suggestion) =>
          suggestion.kind === "emerging" &&
          suggestion.suggestedLabel === "Carbon Rare",
      ),
    ).toBe(false);
  });

  it("preserves accented expressions from evidence", () => {
    const evaluation = evaluateCaptureInput({
      text: "Revisar Ombré Leather",
      nodes: [
        node({ id: "ombre-1", content: "Ombré Leather se siente ahumado" }),
        node({ id: "ombre-2", content: "Ombré Leather proyecta mucho" }),
        node({ id: "ombre-3", content: "Ombré Leather sirve como referencia" }),
      ],
      contexts: [],
      relations: [],
    });
    const emerging = evaluation.conceptSuggestions.find(
      (suggestion) => suggestion.kind === "emerging",
    );

    expect(emerging).toMatchObject({
      kind: "emerging",
      suggestedLabel: "Ombré Leather",
    });
  });

  it("keeps frequent bigrams in their original order", () => {
    const evaluation = evaluateCaptureInput({
      text: "Preparar Sponsor Meeting",
      nodes: [
        node({ id: "sponsor-1", content: "Sponsor Meeting con agenda abierta" }),
        node({ id: "sponsor-2", content: "Sponsor Meeting julio con decisiones" }),
        node({ id: "sponsor-3", content: "Sponsor Meeting para revisar avances" }),
      ],
      contexts: [],
      relations: [],
    });
    const emerging = evaluation.conceptSuggestions.find(
      (suggestion) => suggestion.kind === "emerging",
    );

    expect(emerging).toMatchObject({
      kind: "emerging",
      suggestedLabel: "Sponsor Meeting",
    });
    expect(emerging).not.toMatchObject({ suggestedLabel: "Meeting Sponsor" });
  });

  it("uses lowercase repeated expressions with readable capitalization", () => {
    const evaluation = evaluateCaptureInput({
      text: "ordenar control documental",
      nodes: [
        node({ id: "doc-1", content: "control documental para contratos" }),
        node({ id: "doc-2", content: "control documental de auditoria" }),
        node({ id: "doc-3", content: "control documental semanal" }),
      ],
      contexts: [],
      relations: [],
    });
    const emerging = evaluation.conceptSuggestions.find(
      (suggestion) => suggestion.kind === "emerging",
    );

    expect(emerging).toMatchObject({
      kind: "emerging",
      suggestedLabel: "Control documental",
    });
  });

  it("does not suggest emerging concepts from one evidence capture", () => {
    const evaluation = evaluateCaptureInput({
      text: "Perfume cuero",
      nodes: [node({ id: "p1", content: "Perfume cuero intenso" })],
      contexts: [],
      relations: [],
    });

    expect(
      evaluation.conceptSuggestions.filter(
        (suggestion) => suggestion.kind === "emerging",
      ),
    ).toEqual([]);
  });

  it("deduplicates emerging concepts when an equivalent existing concept explains the cluster", () => {
    const contexts = [context({ id: "reuniones", name: "Reuniones" })];
    const nodes = [
      node({ id: "r1", content: "Reunion semanal con Mitcom" }),
      node({ id: "r2", content: "Reunion de seguimiento comercial" }),
      node({ id: "r3", content: "Reunion para revisar pendientes" }),
    ];
    const evaluation = evaluateCaptureInput({
      text: "Nueva reunion con Mitcom",
      nodes,
      contexts,
      relations: [
        contextRelation("r1", "reuniones"),
        contextRelation("r2", "reuniones"),
      ],
    });

    expect(evaluation.conceptSuggestions).toContainEqual(
      expect.objectContaining({ kind: "existing", conceptId: "reuniones" }),
    );
    expect(
      evaluation.conceptSuggestions.some(
        (suggestion) => suggestion.kind === "emerging",
      ),
    ).toBe(false);
  });

  it("traces concept scores, related captures and threshold decisions", () => {
    const contexts = [
      context({ id: "reuniones", name: "Reuniones" }),
      context({ id: "compras", name: "Compras" }),
    ];
    const nodes = [
      node({
        id: "reunion-1",
        content: "Reunion semanal con proveedor Mitcom para revisar soporte.",
      }),
      node({
        id: "reunion-2",
        content: "Preparar reunion de seguimiento del equipo comercial.",
      }),
    ];
    const relations = [
      contextRelation("reunion-1", "reuniones"),
      contextRelation("reunion-2", "reuniones"),
    ];
    const traces = diagnoseConceptSuggestions({
      text: "Nueva reunion con Mitcom",
      contexts,
      nodes,
      relations,
    });
    const reunionesTrace = traces.find(
      (trace) => trace.context.id === "reuniones",
    );
    const comprasTrace = traces.find((trace) => trace.context.id === "compras");

    expect(traces).toHaveLength(2);
    expect(reunionesTrace).toMatchObject({
      relatedCaptureIds: ["reunion-1", "reunion-2"],
      threshold: MIN_CONCEPT_SCORE,
      included: true,
    });
    expect(reunionesTrace?.score).toBeGreaterThanOrEqual(MIN_CONCEPT_SCORE);
    expect(comprasTrace).toMatchObject({
      relatedCaptureIds: [],
      score: 0,
      threshold: MIN_CONCEPT_SCORE,
      included: false,
    });
  });

  it("suggests existing concepts from names and related captures without low-confidence noise", () => {
    const contexts = [
      context({ id: "perfumes", name: "Perfumes" }),
      context({ id: "compras", name: "Compras" }),
      context({ id: "trabajo", name: "Trabajo" }),
    ];
    const nodes = [
      node({
        id: "rare-carbon",
        content: "Rare Carbon se acerca al perfil de Ombre Leather.",
      }),
    ];
    const suggestions = suggestConcepts({
      text: "Perfumes parecidos a Ombre Leather para comprar",
      contexts,
      nodes,
      relations: [
        {
          id: "rare-carbon-perfumes",
          workspaceId: "workspace-1",
          nodeId: "rare-carbon",
          contextId: "perfumes",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(suggestions.map(getConceptId)).toContain(
      "perfumes",
    );
    expect(suggestions.map(getConceptId)).not.toContain(
      "trabajo",
    );
  });

  it("keeps selected concepts visible even when the query changes", () => {
    const suggestions = suggestConcepts({
      text: "Texto sin coincidencias suficientes",
      contexts: [context({ id: "perfumes", name: "Perfumes" })],
      nodes: [],
      relations: [],
      selectedContextIds: ["perfumes"],
    });

    expect(suggestions.map(getConceptId)).toEqual([
      "perfumes",
    ]);
  });
});

describe("persisted concept label normalization", () => {
  it("creates an order-tolerant equivalence key for concept labels", () => {
    expect(createConceptEquivalenceKey("Rare Carbon")).toBe("carbon|rare");
    expect(createConceptEquivalenceKey("RARE   CARBON")).toBe("carbon|rare");
    expect(createConceptEquivalenceKey("Carbon Rare")).toBe("carbon|rare");
    expect(createConceptEquivalenceKey("Ombré Leather")).toBe("leather|ombre");
  });

  it("merges inverted persisted concepts under the label supported by evidence", async () => {
    const contextRepository = new InMemoryContextRepository([
      context({
        id: "carbon-rare",
        name: "Carbon Rare",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      context({
        id: "rare-carbon",
        name: "Rare Carbon",
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
    ]);
    const nodeRepository = new InMemoryNodeRepository([
      node({ id: "rare-1", content: "Rare Carbon tiene salida intensa" }),
      node({ id: "rare-2", content: "Rare Carbon dura bien en invierno" }),
      node({ id: "rare-3", content: "Rare Carbon queda cerca de Ombre Leather" }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository([
      contextRelation("rare-1", "carbon-rare"),
      contextRelation("rare-2", "carbon-rare"),
      contextRelation("rare-2", "rare-carbon"),
      contextRelation("rare-3", "rare-carbon"),
    ]);

    const diagnostics = await normalizePersistedConceptLabels({
      workspaceId: "workspace-1",
      contextRepository,
      relationRepository,
      nodeRepository,
    });
    const activeContexts = await contextRepository.list({
      workspaceId: "workspace-1",
    });
    const allContexts = await contextRepository.list({
      workspaceId: "workspace-1",
      includeArchived: true,
    });
    const relations = await relationRepository.listByWorkspace("workspace-1");

    expect(activeContexts).toHaveLength(1);
    expect(activeContexts[0]).toMatchObject({
      id: "rare-carbon",
      name: "Rare Carbon",
      archivedAt: null,
    });
    expect(
      allContexts.find((storedContext) => storedContext.id === "carbon-rare"),
    ).toMatchObject({ archivedAt: expect.any(String) });
    expect(
      relations.filter((relation) => relation.contextId === "rare-carbon"),
    ).toHaveLength(3);
    expect(
      relations.filter(
        (relation) =>
          relation.nodeId === "rare-2" && relation.contextId === "rare-carbon",
      ),
    ).toHaveLength(1);
    expect(relations).not.toContainEqual(
      expect.objectContaining({ contextId: "carbon-rare" }),
    );
    expect(diagnostics).toMatchObject({
      equivalenceCandidateCount: 1,
      mergedConceptCount: 1,
      transferredRelationCount: 1,
      duplicateRelationCount: 1,
    });
  });

  it("renames a single inverted concept when evidence repeats the natural expression", async () => {
    const contextRepository = new InMemoryContextRepository([
      context({ id: "carbon-rare", name: "Carbon Rare" }),
    ]);
    const nodeRepository = new InMemoryNodeRepository([
      node({ id: "rare-1", content: "Rare Carbon para revisar" }),
      node({ id: "rare-2", content: "Rare Carbon como referencia" }),
      node({ id: "rare-3", content: "Rare Carbon comprado en oferta" }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository([
      contextRelation("rare-1", "carbon-rare"),
      contextRelation("rare-2", "carbon-rare"),
      contextRelation("rare-3", "carbon-rare"),
    ]);

    const diagnostics = await normalizePersistedConceptLabels({
      workspaceId: "workspace-1",
      contextRepository,
      relationRepository,
      nodeRepository,
    });
    const contexts = await contextRepository.list({
      workspaceId: "workspace-1",
      includeArchived: true,
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      id: "carbon-rare",
      name: "Rare Carbon",
      archivedAt: null,
    });
    expect(diagnostics.renamedConceptCount).toBe(1);
  });

  it("preserves accents when evidence supports the canonical label", async () => {
    const contextRepository = new InMemoryContextRepository([
      context({ id: "leather-ombre", name: "Leather Ombre" }),
      context({ id: "ombre-leather", name: "Ombré Leather" }),
    ]);
    const nodeRepository = new InMemoryNodeRepository([
      node({ id: "ombre-1", content: "Ombré Leather se siente ahumado" }),
      node({ id: "ombre-2", content: "Ombré Leather proyecta mucho" }),
      node({ id: "ombre-3", content: "Ombré Leather sirve como referencia" }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository([
      contextRelation("ombre-1", "leather-ombre"),
      contextRelation("ombre-2", "ombre-leather"),
      contextRelation("ombre-3", "leather-ombre"),
    ]);

    await normalizePersistedConceptLabels({
      workspaceId: "workspace-1",
      contextRepository,
      relationRepository,
      nodeRepository,
    });
    const contexts = await contextRepository.list({ workspaceId: "workspace-1" });

    expect(contexts).toHaveLength(1);
    expect(contexts[0].name).toBe("Ombré Leather");
  });

  it("keeps ambiguous concepts unchanged without clear evidence", async () => {
    const contextRepository = new InMemoryContextRepository([
      context({ id: "control-gestion", name: "Control Gestión" }),
      context({ id: "gestion-control", name: "Gestión del Control" }),
    ]);
    const nodeRepository = new InMemoryNodeRepository([
      node({ id: "control-1", content: "Gestion y control general" }),
      node({ id: "control-2", content: "Control y gestion general" }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository([
      contextRelation("control-1", "control-gestion"),
      contextRelation("control-2", "gestion-control"),
    ]);

    const diagnostics = await normalizePersistedConceptLabels({
      workspaceId: "workspace-1",
      contextRepository,
      relationRepository,
      nodeRepository,
    });
    const contexts = await contextRepository.list({ workspaceId: "workspace-1" });

    expect(contexts.map((storedContext) => storedContext.name).sort()).toEqual([
      "Control Gestión",
      "Gestión del Control",
    ]);
    expect(diagnostics.skippedAmbiguousCount).toBe(1);
  });

  it("is idempotent when executed more than once", async () => {
    const contextRepository = new InMemoryContextRepository([
      context({ id: "meeting-sponsor", name: "Meeting Sponsor" }),
      context({ id: "sponsor-meeting", name: "Sponsor Meeting" }),
    ]);
    const nodeRepository = new InMemoryNodeRepository([
      node({ id: "sponsor-1", content: "Sponsor Meeting con agenda abierta" }),
      node({ id: "sponsor-2", content: "Sponsor Meeting julio con decisiones" }),
      node({ id: "sponsor-3", content: "Sponsor Meeting para revisar avances" }),
    ]);
    const relationRepository = new InMemoryNodeContextRelationRepository([
      contextRelation("sponsor-1", "meeting-sponsor"),
      contextRelation("sponsor-2", "sponsor-meeting"),
      contextRelation("sponsor-3", "meeting-sponsor"),
    ]);

    await normalizePersistedConceptLabels({
      workspaceId: "workspace-1",
      contextRepository,
      relationRepository,
      nodeRepository,
    });
    const afterFirstRun = {
      contexts: await contextRepository.list({
        workspaceId: "workspace-1",
        includeArchived: true,
      }),
      relations: await relationRepository.listByWorkspace("workspace-1"),
    };
    const diagnostics = await normalizePersistedConceptLabels({
      workspaceId: "workspace-1",
      contextRepository,
      relationRepository,
      nodeRepository,
    });
    const afterSecondRun = {
      contexts: await contextRepository.list({
        workspaceId: "workspace-1",
        includeArchived: true,
      }),
      relations: await relationRepository.listByWorkspace("workspace-1"),
    };

    expect(afterSecondRun).toEqual(afterFirstRun);
    expect(diagnostics.mergedConceptCount).toBe(0);
    expect(diagnostics.transferredRelationCount).toBe(0);
    expect(diagnostics.duplicateRelationCount).toBe(0);
  });
});

describe("capture association persistence and graph metrics", () => {
  it("persists capture associations once and can read them bidirectionally", async () => {
    const repository = new InMemoryNodeContextRelationRepository();

    await attachCaptureAssociations(repository, {
      workspaceId: "workspace-1",
      nodeId: "b",
      relatedNodeIds: ["a", "a", "b"],
    });

    const relations = await repository.listByWorkspace("workspace-1");
    expect(relations).toHaveLength(1);
    expect(relations[0]).toMatchObject({
      nodeId: "a",
      contextId: "b",
      relatedNodeId: "b",
      relationType: "CAPTURE_ASSOCIATION",
    });
    expect(getCaptureNeighbors(relations, "a")).toEqual(["b"]);
    expect(getCaptureNeighbors(relations, "b")).toEqual(["a"]);
  });

  it("handles relation failures without stopping the capture flow result", async () => {
    const repository = new InMemoryNodeContextRelationRepository();
    const save = vi
      .spyOn(repository, "save")
      .mockRejectedValueOnce(new Error("IndexedDB failed"));

    const result = await attachCaptureAssociations(repository, {
      workspaceId: "workspace-1",
      nodeId: "new",
      relatedNodeIds: ["old"],
    });

    expect(result.persisted).toHaveLength(0);
    expect(result.failed).toEqual(["old"]);
    save.mockRestore();
  });

  it("calculates graph degree, shared neighbors and simple local centers", () => {
    const relations = [
      relation("a", "b"),
      relation("a", "c"),
      relation("b", "c"),
      relation("a", "d"),
    ];

    expect(countDirectRelations(relations, "a")).toBe(3);
    expect(countSharedNeighbors(relations, "b", "d")).toBe(1);
    expect(detectLocalCenters(relations, ["a", "b", "c", "d"], 0.7)).toEqual([
      { nodeId: "a", degree: 3, normalizedDegree: 1 },
    ]);
  });
});

function node({
  id,
  content,
  status = "ACTIVE",
}: {
  id: string;
  content: string;
  status?: Node["status"];
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
    createdAt: "2026-01-01T00:00:00.000Z",
    contentUpdatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: status === "ARCHIVED" ? "2026-01-02T00:00:00.000Z" : null,
    restoredAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    createdByDeviceId: "device-1",
    lastModifiedByDeviceId: "device-1",
  };
}

function context({
  id,
  name,
  createdAt = "2026-01-01T00:00:00.000Z",
}: {
  id: string;
  name: string;
  createdAt?: string;
}): Context {
  return {
    id,
    workspaceId: "workspace-1",
    type: "AREA",
    name,
    description: null,
    createdAt,
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
  };
}

function getConceptId(suggestion: { kind: string; conceptId?: string }) {
  return suggestion.kind === "existing" ? suggestion.conceptId : undefined;
}

function relation(firstNodeId: string, secondNodeId: string): NodeContextRelation {
  const [nodeId, relatedNodeId] = [firstNodeId, secondNodeId].sort();

  return {
    id: `${nodeId}-${relatedNodeId}`,
    workspaceId: "workspace-1",
    nodeId,
    contextId: relatedNodeId,
    relatedNodeId,
    relationType: "CAPTURE_ASSOCIATION",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function contextRelation(nodeId: string, contextId: string): NodeContextRelation {
  return {
    id: `${nodeId}-${contextId}`,
    workspaceId: "workspace-1",
    nodeId,
    contextId,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeLegacyContextRelation(): NodeContextRelation {
  return {
    id: "legacy-context",
    workspaceId: "workspace-1",
    nodeId: "valid",
    contextId: "context-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}
