import { describe, expect, it, vi } from "vitest";
import type { Node } from "@/domain/node/node";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import {
  buildAssociationIndex,
  calculateBm25,
  calculateTfIdfCosine,
  createAssociationContentDeduplicationKey,
  dedupeAssociationSuggestionsByContent,
  indexCapture,
  suggestAssociations,
} from "@/features/associations/association-engine";
import { normalizeAssociationText } from "@/features/associations/normalize-text";
import { createWordNgrams } from "@/features/associations/ngrams";
import { attachCaptureAssociations } from "@/features/associations/node-associations";
import {
  buildConceptSuggestionsFromTraces,
  diagnoseConceptSuggestionDetails,
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

    expect(suggestions.map((suggestion) => suggestion.node.id)).toEqual([
      "mitcom",
    ]);
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

  it("deduplicates exact equivalent captures in recovery suggestions", () => {
    const suggestions = suggestAssociations(
      buildAssociationIndex({
        nodes: [
          node({
            id: "duplicate-a",
            content:
              "Revisar los cruces donde interactúa personal con equipos móviles.",
          }),
          node({
            id: "duplicate-b",
            content:
              "Revisar los cruces donde interactúa personal con equipos móviles.",
            updatedAt: "2026-08-22T13:10:00.000Z",
          }),
        ],
      }),
      {
        text: "Revisar cruces con equipos móviles",
        limit: 5,
      },
    );

    expect(suggestions.map((suggestion) => suggestion.node.id)).toEqual([
      "duplicate-b",
    ]);
  });

  it("deduplicates markdown, whitespace, case and final superficial punctuation variants", () => {
    expect(
      createAssociationContentDeduplicationKey(
        "**Revisar** los cruces donde _interactúa_ personal con equipos móviles.",
      ),
    ).toBe(
      createAssociationContentDeduplicationKey(
        "  revisar   los cruces\n\ndonde interactúa personal con equipos móviles  ",
      ),
    );

    const suggestions = suggestAssociations(
      buildAssociationIndex({
        nodes: [
          node({
            id: "markdown",
            content:
              "**Revisar** los cruces donde _interactúa_ personal con equipos móviles.",
          }),
          node({
            id: "plain",
            content:
              "revisar los cruces donde interactúa personal con equipos móviles",
          }),
        ],
      }),
      {
        text: "Revisar cruces con equipos móviles",
        limit: 5,
      },
    );

    expect(suggestions).toHaveLength(1);
  });

  it("keeps meaningful symbols inside expressions, urls and technical conditions", () => {
    expect(createAssociationContentDeduplicationKey("Calcular a + b")).not.toBe(
      createAssociationContentDeduplicationKey("Calcular a - b"),
    );
    expect(
      createAssociationContentDeduplicationKey(
        "https://vinema.local/search?estado=abierto",
      ),
    ).not.toBe(
      createAssociationContentDeduplicationKey(
        "https://vinema.local/search?estado=cerrado",
      ),
    );
    expect(
      createAssociationContentDeduplicationKey("estado != cerrado"),
    ).not.toBe(createAssociationContentDeduplicationKey("estado == cerrado"));
    expect(
      createAssociationContentDeduplicationKey(
        "Revisar los cruces donde interactúa personal: aprobar control.",
      ),
    ).not.toBe(
      createAssociationContentDeduplicationKey(
        "Revisar los cruces donde interactúa personal: rechazar control.",
      ),
    );
  });

  it("does not merge suggestions that only differ by meaningful symbols", () => {
    const suggestions = dedupeAssociationSuggestionsByContent([
      associationSuggestion({
        id: "sum",
        content: "Calcular a + b",
        score: 0.6,
      }),
      associationSuggestion({
        id: "subtraction",
        content: "Calcular a - b",
        score: 0.6,
      }),
      associationSuggestion({
        id: "not-equal",
        content: "estado != cerrado",
        score: 0.6,
      }),
      associationSuggestion({
        id: "equal",
        content: "estado == cerrado",
        score: 0.6,
      }),
    ]);

    expect(suggestions.map((suggestion) => suggestion.node.id)).toEqual([
      "sum",
      "subtraction",
      "not-equal",
      "equal",
    ]);
  });

  it("keeps captures with the same beginning or concepts but different full content", () => {
    const sameBeginningSuggestions = suggestAssociations(
      buildAssociationIndex({
        nodes: [
          node({
            id: "beginning-a",
            content:
              "Revisar los cruces donde interactúa personal con equipos móviles al inicio del turno.",
          }),
          node({
            id: "beginning-b",
            content:
              "Revisar los cruces donde interactúa personal con equipos móviles durante maniobras nocturnas.",
          }),
        ],
      }),
      {
        text: "Revisar cruces con equipos móviles",
        limit: 5,
      },
    );

    expect(sameBeginningSuggestions.map((suggestion) => suggestion.node.id)).toEqual([
      "beginning-a",
      "beginning-b",
    ]);

    const sameConceptSuggestions = suggestAssociations(
      buildAssociationIndex({
        nodes: [
          node({
            id: "concept-a",
            content:
              "Cruces peatonales requieren barreras físicas junto a equipos móviles.",
          }),
          node({
            id: "concept-b",
            content:
              "Radio de operación exige señalización clara para equipos móviles.",
          }),
        ],
      }),
      {
        text: "equipos móviles",
        limit: 5,
      },
    );

    expect(sameConceptSuggestions.map((suggestion) => suggestion.node.id)).toEqual(
      expect.arrayContaining(["concept-a", "concept-b"]),
    );
    expect(sameConceptSuggestions).toHaveLength(2);
  });

  it("chooses a deterministic duplicate representative by score, date and id", () => {
    const duplicateContent = "Revisar cruces de interacción con equipos móviles.";

    expect(
      dedupeAssociationSuggestionsByContent([
        associationSuggestion({
          id: "lower",
          content: duplicateContent,
          score: 0.2,
          updatedAt: "2026-08-22T13:10:00.000Z",
        }),
        associationSuggestion({
          id: "higher",
          content: duplicateContent,
          score: 0.7,
          updatedAt: "2026-08-22T12:21:00.000Z",
        }),
      ]).map((suggestion) => suggestion.node.id),
    ).toEqual(["higher"]);

    expect(
      dedupeAssociationSuggestionsByContent([
        associationSuggestion({
          id: "older",
          content: duplicateContent,
          score: 0.5,
          updatedAt: "2026-08-22T12:21:00.000Z",
        }),
        associationSuggestion({
          id: "newer",
          content: duplicateContent,
          score: 0.5,
          updatedAt: "2026-08-22T13:10:00.000Z",
        }),
      ]).map((suggestion) => suggestion.node.id),
    ).toEqual(["newer"]);

    expect(
      dedupeAssociationSuggestionsByContent([
        associationSuggestion({
          id: "b-id",
          content: duplicateContent,
          score: 0.5,
        }),
        associationSuggestion({
          id: "a-id",
          content: duplicateContent,
          score: 0.5,
        }),
      ]).map((suggestion) => suggestion.node.id),
    ).toEqual(["a-id"]);
  });

  it("deduplicates before applying the visual limit and keeps archived captures excluded", () => {
    const suggestions = suggestAssociations(
      buildAssociationIndex({
        nodes: [
          node({
            id: "duplicate-new",
            content:
              "Revisar cruces donde interactúa personal con equipos móviles.",
            updatedAt: "2026-08-22T13:10:00.000Z",
          }),
          node({
            id: "duplicate-old",
            content:
              "Revisar cruces donde interactúa personal con equipos móviles.",
            updatedAt: "2026-08-22T12:21:00.000Z",
          }),
          node({
            id: "useful",
            content:
              "Evaluar barreras físicas para peatones cerca de equipos móviles.",
          }),
          node({
            id: "archived",
            content:
              "Revisar cruces donde interactúa personal con equipos móviles.",
            status: "ARCHIVED",
          }),
        ],
      }),
      {
        text: "Revisar equipos móviles barreras físicas",
        limit: 2,
      },
    );

    expect(suggestions.map((suggestion) => suggestion.node.id)).toEqual(
      expect.arrayContaining(["duplicate-new", "useful"]),
    );
    expect(suggestions).toHaveLength(2);
  });

  it("keeps recovery suggestion order deterministic across equivalent evaluations", () => {
    const nodes = [
      node({
        id: "a",
        content: "Revisar cruces de peatones con equipos móviles.",
      }),
      node({
        id: "b",
        content: "Evaluar barreras físicas para equipos móviles.",
      }),
      node({
        id: "c",
        content: "Radio de operación de equipos móviles en maniobras.",
      }),
    ];
    const input = {
      text: "equipos móviles barreras radio operación",
      limit: 5,
    };
    const first = suggestAssociations(buildAssociationIndex({ nodes }), input).map(
      (suggestion) => suggestion.node.id,
    );
    const second = suggestAssociations(
      buildAssociationIndex({ nodes: [...nodes].reverse() }),
      input,
    ).map((suggestion) => suggestion.node.id);

    expect(second).toEqual(first);
  });

  it("does not recover memories whose directional claim contradicts the current text", () => {
    const dustText =
      "Durante la perforación de avance, el control del polvo requiere humectación continua y ventilación suficiente. La exposición a sílice respirable aumenta cuando el material se perfora en seco o la extracción de aire es insuficiente.";
    const suggestions = suggestAssociations(
      buildAssociationIndex({
        nodes: [
          node({
            id: "perforacion",
            content:
              "Durante la perforación de avance, una mala iluminación puede dificultar la identificación de personas u obstáculos en el frente de trabajo.",
          }),
          node({
            id: "segregacion",
            content:
              "La segregación mediante barreras físicas disminuye la exposición de peatones a equipos móviles durante las maniobras.",
          }),
        ],
      }),
      {
        text: dustText,
        limit: 5,
      },
    );

    expect(suggestions.map((suggestion) => suggestion.node.id)).toEqual([
      "perforacion",
    ]);
  });

  it("does not use directional verbs or isolated generic control as thematic anchors", () => {
    const suggestions = suggestAssociations(
      buildAssociationIndex({
        nodes: [
          node({
            id: "control-polvo",
            content:
              "El control del polvo requiere filtros limpios y revisión diaria.",
          }),
          node({
            id: "control-acceso",
            content:
              "El control de acceso aumenta la seguridad del edificio.",
          }),
        ],
      }),
      {
        text: "El control del polvo aumenta cuando la limpieza de filtros mejora.",
        limit: 5,
      },
    );

    expect(suggestions.map((suggestion) => suggestion.node.id)).toEqual([
      "control-polvo",
    ]);
  });

  it("does not recover memories from isolated temporal words or generic verbs", () => {
    const suggestions = suggestAssociations(
      buildAssociationIndex({
        nodes: [
          node({
            id: "maniobra-retroceso",
            content:
              "Antes de iniciar una maniobra en retroceso con equipos móviles se revisa la visibilidad del operador.",
          }),
          node({
            id: "cruces-senalizacion",
            content:
              "Mantener señalización clara en cruces donde interactúan peatones y equipos móviles.",
          }),
          node({
            id: "interaccion-equipos",
            content:
              "Mantener distancia operacional entre trabajadores y equipos móviles durante la circulación.",
          }),
        ],
      }),
      {
        text: "Durante las últimas semanas me cuesta conciliar el sueño cuando uso el teléfono justo antes de acostarme. Dejar la pantalla una hora antes y mantener un horario regular parece mejorar mi descanso al día siguiente.",
        limit: 5,
      },
    );

    expect(suggestions).toEqual([]);
  });

  it("allows generic verbs only when their object or phrase is shared", () => {
    const suggestions = suggestAssociations(
      buildAssociationIndex({
        nodes: [
          node({
            id: "horario",
            content:
              "Mantener horario regular ayuda a ordenar la rutina diaria.",
          }),
          node({
            id: "senalizacion",
            content:
              "Mantener señalización clara en cruces operacionales.",
          }),
        ],
      }),
      {
        text: "Mantener horario regular mejora la planificación semanal.",
        limit: 5,
      },
    );

    expect(suggestions.map((suggestion) => suggestion.node.id)).toEqual([
      "horario",
    ]);
  });
});

describe("concept suggestions", () => {
  it("returns emerging concepts from strong terms in the current input", () => {
    const evaluation = evaluateCaptureInput({
      text: "Revisar Railway para la sincronizacion de Vinema",
      nodes: [],
      contexts: [],
      relations: [],
    });
    const emerging = evaluation.conceptSuggestions.filter(
      (suggestion) => suggestion.kind === "emerging",
    );

    expect(emerging).toContainEqual(
      expect.objectContaining({
        kind: "emerging",
        suggestedLabel: "Railway",
        evidenceCaptureIds: [],
        representativeTerms: ["railway"],
      }),
    );
    expect(evaluation.diagnostics.emergingConceptSuggestionCount).toBeGreaterThan(0);
  });

  it("suggests at least one current-text emerging concept before saving with empty memory", () => {
    const evaluation = evaluateCaptureInput({
      text: "Durante la perforación de avance, una mala iluminación puede dificultar la identificación de personas u obstáculos en el frente de trabajo.",
      nodes: [],
      contexts: [],
      relations: [],
    });

    expect(
      evaluation.conceptSuggestions.filter(
        (suggestion) => suggestion.kind === "emerging",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("suggests current-text mobile equipment risk concepts before saving with empty memory", () => {
    const evaluation = evaluateCaptureInput({
      text: "Los equipos móviles presentan mayor riesgo de atropello cuando existen personas circulando dentro de su radio de operación.",
      nodes: [],
      contexts: [],
      relations: [],
    });
    const emergingLabels = evaluation.conceptSuggestions
      .filter((suggestion) => suggestion.kind === "emerging")
      .map((suggestion) => suggestion.suggestedLabel);

    expect(emergingLabels).toEqual(
      expect.arrayContaining([
        "Equipos móviles",
        "Riesgo de atropello",
        "Radio de operación",
      ]),
    );
  });

  it("suggests derived late detection concepts from current input before saving", () => {
    const evaluation = evaluateCaptureInput({
      text: "En sectores con baja visibilidad, el operador puede detectar tardíamente a trabajadores que ingresan al área de maniobra del equipo.",
      nodes: [],
      contexts: [],
      relations: [],
    });
    const emergingLabels = evaluation.conceptSuggestions
      .filter((suggestion) => suggestion.kind === "emerging")
      .map((suggestion) => suggestion.suggestedLabel);

    expect(emergingLabels).toEqual(expect.arrayContaining(["Detección tardía"]));
  });

  it("suggests segregation controls without conjugated verb article noise", () => {
    const evaluation = evaluateCaptureInput({
      text: "La segregación mediante barreras físicas disminuye la exposición de peatones a equipos móviles durante las maniobras.",
      nodes: [],
      contexts: [],
      relations: [],
    });
    const emergingLabels = evaluation.conceptSuggestions
      .filter((suggestion) => suggestion.kind === "emerging")
      .map((suggestion) => suggestion.suggestedLabel);

    expect(emergingLabels).toEqual(
      expect.arrayContaining([
        "Segregación",
        "Barreras físicas",
        "Equipos móviles",
        "Exposición de peatones",
      ]),
    );
    expect(emergingLabels).not.toContain("Disminuye la exposición");
  });

  it("requires local support before dragging related concepts from prior co-occurrence", () => {
    const nodes = [
      node({
        id: "capture-1",
        content:
          "Durante la perforación de avance, una mala iluminación puede dificultar la identificación de personas u obstáculos en el frente de trabajo.",
      }),
      node({
        id: "capture-2",
        content:
          "Los equipos móviles presentan mayor riesgo de atropello cuando existen personas circulando dentro de su radio de operación.",
      }),
      node({
        id: "capture-3",
        content:
          "En sectores con baja visibilidad, el operador puede detectar tardíamente a trabajadores que ingresan al área de maniobra del equipo.",
      }),
    ];
    const contexts = [
      context({ id: "identificacion-personas", name: "Identificación de personas" }),
      context({ id: "mala-iluminacion", name: "Mala iluminación" }),
      context({ id: "perforacion-avance", name: "Perforación de avance" }),
      context({ id: "equipos-moviles", name: "Equipos móviles" }),
      context({ id: "radio-operacion", name: "Radio de operación" }),
      context({ id: "riesgo-atropello", name: "Riesgo de atropello" }),
      context({ id: "area-maniobra", name: "Área de maniobra" }),
      context({ id: "baja-visibilidad", name: "Baja visibilidad" }),
      context({ id: "maniobra-equipo", name: "Maniobra del equipo" }),
      context({ id: "deteccion-tardia", name: "Detección tardía" }),
    ];
    const relations = [
      contextRelation("capture-1", "identificacion-personas"),
      contextRelation("capture-1", "mala-iluminacion"),
      contextRelation("capture-1", "perforacion-avance"),
      contextRelation("capture-2", "equipos-moviles"),
      contextRelation("capture-2", "radio-operacion"),
      contextRelation("capture-2", "riesgo-atropello"),
      contextRelation("capture-3", "area-maniobra"),
      contextRelation("capture-3", "baja-visibilidad"),
      contextRelation("capture-3", "maniobra-equipo"),
      contextRelation("capture-3", "deteccion-tardia"),
      contextRelation("capture-3", "identificacion-personas"),
      contextRelation("capture-3", "mala-iluminacion"),
    ];
    const evaluation = evaluateCaptureInput({
      text: "La segregación mediante barreras físicas disminuye la exposición de peatones a equipos móviles durante las maniobras.",
      nodes,
      contexts,
      relations,
    });
    const existingLabels = evaluation.conceptSuggestions
      .filter((suggestion) => suggestion.kind === "existing")
      .map((suggestion) => suggestion.label);
    const emergingLabels = evaluation.conceptSuggestions
      .filter((suggestion) => suggestion.kind === "emerging")
      .map((suggestion) => suggestion.suggestedLabel);

    expect(existingLabels).toEqual(
      expect.arrayContaining([
        "Equipos móviles",
        "Área de maniobra",
        "Maniobra del equipo",
        "Identificación de personas",
      ]),
    );
    expect(existingLabels).not.toContain("Baja visibilidad");
    expect(existingLabels).not.toContain("Mala iluminación");
    expect(emergingLabels).toEqual(
      expect.arrayContaining([
        "Segregación",
        "Barreras físicas",
        "Exposición de peatones",
      ]),
    );
  });

  it("keeps maneuver concepts while preventing dust and silica thematic contamination", () => {
    const nodes = [
      node({
        id: "capture-1",
        content:
          "Durante la perforación de avance, una mala iluminación puede dificultar la identificación de personas u obstáculos en el frente de trabajo.",
      }),
      node({
        id: "capture-2",
        content:
          "Los equipos móviles presentan mayor riesgo de atropello cuando existen personas circulando dentro de su radio de operación.",
      }),
      node({
        id: "capture-3",
        content:
          "En sectores con baja visibilidad, el operador puede detectar tardíamente a trabajadores que ingresan al área de maniobra del equipo.",
      }),
      node({
        id: "capture-4",
        content:
          "La segregación mediante barreras físicas disminuye la exposición de peatones a equipos móviles durante las maniobras.",
      }),
      node({
        id: "archived",
        content:
          "La segregación mediante barreras físicas disminuye la exposición de peatones a equipos móviles durante las maniobras.",
        status: "ARCHIVED",
      }),
    ];
    const contexts = [
      context({ id: "perforacion-avance", name: "Perforación de avance" }),
      context({ id: "equipos-moviles", name: "Equipos móviles" }),
      context({ id: "radio-operacion", name: "Radio de operación" }),
      context({ id: "riesgo-atropello", name: "Riesgo de atropello" }),
      context({ id: "baja-visibilidad", name: "Baja visibilidad" }),
      context({ id: "segregacion", name: "Segregación" }),
      context({ id: "disminuye-exposicion", name: "Disminuye la exposición" }),
    ];
    const relations = [
      contextRelation("capture-1", "perforacion-avance"),
      contextRelation("capture-2", "equipos-moviles"),
      contextRelation("capture-2", "radio-operacion"),
      contextRelation("capture-2", "riesgo-atropello"),
      contextRelation("capture-3", "baja-visibilidad"),
      contextRelation("capture-4", "segregacion"),
      contextRelation("capture-4", "equipos-moviles"),
      contextRelation("capture-4", "disminuye-exposicion"),
      contextRelation("archived", "segregacion"),
    ];
    const maneuver = evaluateCaptureInput({
      text: "Durante una maniobra en retroceso con equipos móviles existe riesgo de atropello cuando la baja visibilidad afecta al operador.",
      nodes,
      contexts,
      relations,
    });
    const maneuverLabels = maneuver.conceptSuggestions.map((suggestion) =>
      suggestion.kind === "existing" ? suggestion.label : suggestion.suggestedLabel,
    );
    const dust = evaluateCaptureInput({
      text: "Durante la perforación de avance, el control del polvo requiere humectación continua y ventilación suficiente. La exposición a sílice respirable aumenta cuando el material se perfora en seco o la extracción de aire es insuficiente.",
      nodes,
      contexts,
      relations,
    });
    const dustLabels = dust.conceptSuggestions.map((suggestion) =>
      suggestion.kind === "existing" ? suggestion.label : suggestion.suggestedLabel,
    );

    expect(maneuverLabels).toEqual(
      expect.arrayContaining([
        "Equipos móviles",
        "Riesgo de atropello",
        "Baja visibilidad",
      ]),
    );
    expect(dustLabels).toContain("Perforación de avance");
    expect(dustLabels).not.toContain("Equipos móviles");
    expect(dustLabels).not.toContain("Radio de operación");
    expect(dustLabels).not.toContain("Riesgo de atropello");
    expect(dustLabels).not.toContain("Segregación");
    expect(dustLabels).not.toContain("Disminuye la exposición");
    expect(dust.recoveryMatches.map((match) => match.node.id)).toEqual([
      "capture-1",
    ]);
  });

  it("does not create emerging concepts from evidence that contradicts local direction", () => {
    const dustText =
      "La exposición a sílice respirable aumenta cuando el material se perfora en seco.";
    const evaluation = evaluateCaptureInput({
      text: dustText,
      nodes: [
        node({
          id: "exposure-1",
          content:
            "La barrera física disminuye la exposición de peatones a equipos móviles.",
        }),
        node({
          id: "exposure-2",
          content:
            "La segregación disminuye la exposición durante maniobras con equipos móviles.",
        }),
        node({
          id: "exposure-3",
          content:
            "El control operacional disminuye la exposición en el área de trabajo.",
        }),
      ],
      contexts: [],
      relations: [],
    });
    const labels = evaluation.conceptSuggestions.map((suggestion) =>
      suggestion.kind === "existing" ? suggestion.label : suggestion.suggestedLabel,
    );

    expect(labels).not.toContain("Disminuye la exposición");
  });

  it("keeps sleep capture concepts and memories isolated from mining vocabulary", () => {
    const evaluation = evaluateCaptureInput({
      text: "Durante las últimas semanas me cuesta conciliar el sueño cuando uso el teléfono justo antes de acostarme. Dejar la pantalla una hora antes y mantener un horario regular parece mejorar mi descanso al día siguiente.",
      nodes: [
        node({
          id: "maniobra-retroceso",
          content:
            "Antes de iniciar una maniobra en retroceso con equipos móviles se revisa la visibilidad del operador.",
        }),
        node({
          id: "cruces-senalizacion",
          content:
            "Mantener señalización clara en cruces donde interactúan peatones y equipos móviles.",
        }),
        node({
          id: "interaccion-equipos",
          content:
            "Mantener distancia operacional entre trabajadores y equipos móviles durante la circulación.",
        }),
      ],
      contexts: [
        context({ id: "maniobra-equipo", name: "Maniobra del equipo" }),
      ],
      relations: [],
    });
    const labels = evaluation.conceptSuggestions.map((suggestion) =>
      suggestion.kind === "existing" ? suggestion.label : suggestion.suggestedLabel,
    );

    expect(labels).toEqual(
      expect.arrayContaining([
        "Conciliar el sueño",
        "Horario regular",
        "Pantalla",
        "Descanso",
      ]),
    );
    expect(labels).not.toEqual(
      expect.arrayContaining([
        "Maniobra del equipo",
        "Dejar",
        "Antes de acostarme",
        "acostarme Dejar",
        "Cuesta conciliar",
        "Parece mejorar",
      ]),
    );
    expect(evaluation.recoveryMatches).toEqual([]);
  });

  it("does not create current-input emerging noise for empty or generic text", () => {
    for (const text of ["", "   ", "re", "Necesito revisar esto despues"]) {
      const evaluation = evaluateCaptureInput({
        text,
        nodes: [],
        contexts: [],
        relations: [],
      });

      expect(
        evaluation.conceptSuggestions.filter(
          (suggestion) => suggestion.kind === "emerging",
        ),
      ).toEqual([]);
    }
  });

  it("deduplicates and orders existing concepts before equivalent emerging concepts", () => {
    const evaluation = evaluateCaptureInput({
      text: "Revisar Railway",
      nodes: [],
      contexts: [context({ id: "railway", name: "Railway" })],
      relations: [],
    });

    expect(evaluation.conceptSuggestions[0]).toMatchObject({
      kind: "existing",
      conceptId: "railway",
      label: "Railway",
    });
    expect(
      evaluation.conceptSuggestions.some(
        (suggestion) => suggestion.kind === "emerging",
      ),
    ).toBe(false);
  });

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
    expect(evaluation.diagnostics.emergingConceptSuggestionCount).toBeGreaterThanOrEqual(1);
    expect(evaluation.diagnostics.clusterCount).toBeGreaterThanOrEqual(1);
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

    expect(evaluation.conceptSuggestions).toContainEqual(
      expect.objectContaining({
        kind: "emerging",
        suggestedLabel: "Perfumes",
        evidenceCaptureIds: [],
      }),
    );
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
        (suggestion) =>
          suggestion.kind === "emerging" &&
          suggestion.suggestedLabel === "Reuniones",
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

  it("builds suggestions from a single reusable concept diagnosis", () => {
    const contexts = [
      context({ id: "postgresql", name: "PostgreSQL", aliases: ["Postgres", "PG"] }),
      context({ id: "railway", name: "Railway" }),
    ];
    const nodes = [node({ id: "db-1", content: "Postgres y Railway en despliegue" })];
    const relations = [contextRelation("db-1", "postgresql")];
    const diagnosis = diagnoseConceptSuggestionDetails({
      text: "Postgres requiere revisar Railway",
      contexts,
      nodes,
      relations,
    });
    const fromReusableTraces = buildConceptSuggestionsFromTraces({
      contexts,
      traces: diagnosis.traces,
    });
    const directSuggestions = suggestConcepts({
      text: "Postgres requiere revisar Railway",
      contexts,
      nodes,
      relations,
    });

    expect(fromReusableTraces).toEqual(directSuggestions);
    expect(diagnosis.metrics.diagnosticRunCount).toBe(1);
    expect(diagnosis.metrics.identityContextTraversalCount).toBe(contexts.length);
    expect(diagnosis.metrics.identityCandidateInitialCount).toBeGreaterThan(
      diagnosis.metrics.identityCandidateDeduplicatedCount,
    );
  });

  it("reports one diagnosis and one deduplicated identity extraction per evaluation", () => {
    const evaluation = evaluateCaptureInput({
      text: "Postgres Postgres PG requiere respaldo",
      nodes: [],
      contexts: [
        context({
          id: "postgresql",
          name: "PostgreSQL",
          aliases: ["Postgres", "PG"],
        }),
      ],
      relations: [],
    });

    expect(evaluation.diagnostics.conceptDiagnosticRunCount).toBe(1);
    expect(evaluation.diagnostics.identityContextTraversalCount).toBe(1);
    expect(evaluation.diagnostics.identityCandidateInitialCount).toBeGreaterThan(
      evaluation.diagnostics.identityCandidateDeduplicatedCount ?? 0,
    );
    expect(evaluation.conceptSuggestions).toContainEqual(
      expect.objectContaining({
        kind: "existing",
        conceptId: "postgresql",
        matchedAlias: "Postgres",
      }),
    );
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
          version: 1,
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

  it("resolves existing concepts through explicit aliases and keeps the canonical label visible", () => {
    const suggestions = suggestConcepts({
      text: "OC debe consolidar contratos antes del cierre",
      contexts: [
        context({
          id: "operational-core",
          name: "Operational Core",
          aliases: ["OC", "Ops Core"],
        }),
      ],
      nodes: [],
      relations: [],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      kind: "existing",
      conceptId: "operational-core",
      label: "Operational Core",
      matchedAlias: "OC",
    });
  });

  it("does not resolve stop words or derived one-letter acronyms as concepts", () => {
    const suggestions = suggestConcepts({
      text: "Voy a revisar pagos pendientes",
      contexts: [
        context({
          id: "agosto",
          name: "Agosto",
          aliases: ["a"],
          normalizedAliases: ["a"],
        }),
      ],
      nodes: [],
      relations: [],
    });

    expect(suggestions).toEqual([]);
  });

  it("allows a confirmed one-letter acronym without creating one from lowercase stop words", () => {
    const confirmed = suggestConcepts({
      text: "X requiere seguimiento",
      contexts: [
        context({
          id: "expediente",
          name: "Expediente reservado",
          aliases: ["X"],
        }),
      ],
      nodes: [],
      relations: [],
    });
    const lowerStopword = suggestConcepts({
      text: "a requiere seguimiento",
      contexts: [
        context({
          id: "agosto",
          name: "Agosto",
          aliases: ["A"],
        }),
      ],
      nodes: [],
      relations: [],
    });

    expect(confirmed).toMatchObject([
      {
        kind: "existing",
        conceptId: "expediente",
        label: "Expediente reservado",
        matchedAlias: "X",
      },
    ]);
    expect(lowerStopword).toEqual([]);
  });

  it("resolves unique derived acronyms but does not choose ambiguous acronyms", () => {
    const unique = suggestConcepts({
      text: "MAN tiene avances operacionales",
      contexts: [context({ id: "mina-andes-norte", name: "Mina Andes Norte" })],
      nodes: [],
      relations: [],
    });
    const ambiguous = suggestConcepts({
      text: "AT necesita revision",
      contexts: [
        context({ id: "access-tracking", name: "Access Tracking" }),
        context({ id: "andres-tapia", name: "Andres Tapia" }),
      ],
      nodes: [],
      relations: [],
    });

    expect(unique).toMatchObject([
      {
        kind: "existing",
        conceptId: "mina-andes-norte",
        label: "Mina Andes Norte",
        matchedAlias: "MAN",
      },
    ]);
    expect(ambiguous).toEqual([]);
  });

  it("preserves ambiguous alias behavior through the identity index", () => {
    const suggestions = suggestConcepts({
      text: "OPS necesita revision operativa",
      contexts: [
        context({ id: "operations", name: "Operations", aliases: ["OPS"] }),
        context({ id: "open-platform", name: "Open Platform", aliases: ["OPS"] }),
      ],
      nodes: [],
      relations: [],
    });

    expect(suggestions).toHaveLength(2);
    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "existing",
          conceptId: "operations",
          matchedAlias: undefined,
        }),
        expect.objectContaining({
          kind: "existing",
          conceptId: "open-platform",
          matchedAlias: undefined,
        }),
      ]),
    );
  });

  it("does not suggest a new emerging concept when an alias resolves to an existing identity", () => {
    const evaluation = evaluateCaptureInput({
      text: "Postgres requiere respaldos antes del cambio",
      contexts: [
        context({
          id: "postgresql",
          name: "PostgreSQL",
          aliases: ["Postgres", "PG"],
        }),
      ],
      nodes: [],
      relations: [],
    });

    expect(evaluation.conceptSuggestions).toContainEqual(
      expect.objectContaining({
        kind: "existing",
        conceptId: "postgresql",
        label: "PostgreSQL",
        matchedAlias: "Postgres",
      }),
    );
    expect(
      evaluation.conceptSuggestions.some(
        (suggestion) =>
          suggestion.kind === "emerging" &&
          suggestion.suggestedLabel === "Postgres",
      ),
    ).toBe(false);
  });

  it("preserves existing knowledge reasons when equivalent concept suggestions are deduplicated", () => {
    const nodes = [
      node({
        id: "memory-1",
        content: "Mitcom y Tracking revisan continuidad operacional.",
      }),
      node({
        id: "memory-2",
        content: "Mitcom y Tracking preparan continuidad operacional.",
      }),
      node({
        id: "memory-3",
        content: "Mitcom y Tracking cierran continuidad operacional.",
      }),
    ];
    const evaluation = evaluateCaptureInput({
      text: "Mitcom continuidad operacional",
      nodes,
      contexts: [
        context({ id: "mitcom", name: "Mitcom" }),
        context({ id: "tracking", name: "Tracking" }),
      ],
      relations: [
        contextRelation("memory-1", "mitcom"),
        contextRelation("memory-1", "tracking"),
        contextRelation("memory-2", "mitcom"),
        contextRelation("memory-2", "tracking"),
        contextRelation("memory-3", "mitcom"),
        contextRelation("memory-3", "tracking"),
      ],
    });
    const tracking = evaluation.conceptSuggestions.find(
      (suggestion) => suggestion.kind === "existing" && suggestion.conceptId === "tracking",
    );

    expect(tracking).toMatchObject({
      kind: "existing",
      conceptId: "tracking",
      knowledgeSuggestionReasons: expect.arrayContaining([
        "Existe memoria previa que podría ser relevante",
      ]),
    });
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

    expect(activeContexts).toHaveLength(2);
    expect(activeContexts.find((context) => context.id === "rare-carbon")).toMatchObject({
      id: "rare-carbon",
      name: "Rare Carbon",
      archivedAt: null,
    });
    expect(
      allContexts.find((storedContext) => storedContext.id === "carbon-rare"),
    ).toMatchObject({
      archivedAt: null,
      description: expect.stringContaining("Fusionado en Rare Carbon"),
    });
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

    expect(contexts).toHaveLength(2);
    expect(contexts.map((context) => context.name)).toContain("Ombré Leather");
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
  updatedAt = "2026-01-01T00:00:00.000Z",
}: {
  id: string;
  content: string;
  status?: Node["status"];
  updatedAt?: string;
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
    contentUpdatedAt: updatedAt,
    archivedAt: status === "ARCHIVED" ? "2026-01-02T00:00:00.000Z" : null,
    restoredAt: null,
    updatedAt,
    deletedAt: null,
    createdByDeviceId: "device-1",
    lastModifiedByDeviceId: "device-1",
  };
}

function associationSuggestion({
  id,
  content,
  score,
  updatedAt = "2026-01-01T00:00:00.000Z",
}: {
  id: string;
  content: string;
  score: number;
  updatedAt?: string;
}) {
  return {
    node: node({ id, content, updatedAt }),
    score,
    excerpt: content,
    reasons: [{ type: "TERM_MATCH", terms: ["revisar"] }],
  } satisfies ReturnType<typeof suggestAssociations>[number];
}

function context({
  id,
  name,
  aliases = [],
  normalizedAliases = [],
  createdAt = "2026-01-01T00:00:00.000Z",
}: {
  id: string;
  name: string;
  aliases?: string[];
  normalizedAliases?: string[];
  createdAt?: string;
}): Context {
  return {
    id,
    workspaceId: "workspace-1",
    type: "AREA",
    name,
    description: null,
    aliases,
    normalizedAliases,
    version: 1,
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
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function contextRelation(nodeId: string, contextId: string): NodeContextRelation {
  return {
    id: `${nodeId}-${contextId}`,
    workspaceId: "workspace-1",
    nodeId,
    contextId,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeLegacyContextRelation(): NodeContextRelation {
  return {
    id: "legacy-context",
    workspaceId: "workspace-1",
    nodeId: "valid",
    contextId: "context-1",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}
