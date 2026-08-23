import { describe, expect, it } from "vitest";
import {
  hasDirectionalContradiction,
  hasLocalConceptIdentitySupport,
  hasMeaningfulLocalTokenOverlap,
  HUMAN_ENTITY_TERMS,
} from "@/features/associations/local-support";

describe("local semantic support", () => {
  it("uses meaningful linguistic support across non-mining domains", () => {
    expect(
      hasLocalConceptIdentitySupport({
        localText: "El paciente reporta dolor crónico despues del tratamiento.",
        labels: ["Manejo del dolor"],
      }),
    ).toBe(true);
    expect(
      hasLocalConceptIdentitySupport({
        localText: "La caché reduce latencia en consultas frecuentes.",
        labels: ["Optimización de caché"],
      }),
    ).toBe(true);
    expect(
      hasLocalConceptIdentitySupport({
        localText: "Planificar colaciones mejora la alimentación semanal.",
        labels: ["Alimentación semanal"],
      }),
    ).toBe(true);
    expect(
      hasLocalConceptIdentitySupport({
        localText: "Los estudiantes reciben apoyo antes de la evaluación.",
        labels: ["Apoyo a estudiantes"],
      }),
    ).toBe(true);
    expect(
      hasLocalConceptIdentitySupport({
        localText: "Los clientes necesitan acuerdos claros en la conversación.",
        labels: ["Relación con clientes"],
      }),
    ).toBe(true);
  });

  it("keeps same-domain but unsupported concepts ineligible", () => {
    expect(
      hasLocalConceptIdentitySupport({
        localText: "El paciente reporta dolor crónico despues del tratamiento.",
        labels: ["Optimización de caché"],
      }),
    ).toBe(false);
    expect(
      hasMeaningfulLocalTokenOverlap(
        "La caché reduce latencia en consultas frecuentes.",
        "El deploy corrige estilos visuales del formulario.",
      ),
    ).toBe(false);
  });

  it("does not let human entity terms become standalone support", () => {
    expect(
      hasLocalConceptIdentitySupport({
        localText: "El paciente llega temprano a la consulta.",
        labels: ["Relación con clientes"],
      }),
    ).toBe(false);
    expect(
      hasLocalConceptIdentitySupport({
        localText: "El estudiante prepara la evaluación final.",
        labels: ["Seguridad de trabajadores"],
      }),
    ).toBe(false);
    expect(
      hasLocalConceptIdentitySupport({
        localText: "El peatón cruza por la vereda principal.",
        labels: ["Gestión de usuarios"],
      }),
    ).toBe(false);
    expect(
      hasLocalConceptIdentitySupport({
        localText: "Una persona espera en recepción.",
        labels: ["Personas"],
      }),
    ).toBe(false);
  });

  it("uses the human bridge only when independent thematic support is present", () => {
    expect(
      hasLocalConceptIdentitySupport({
        localText:
          "Los pacientes requieren seguimiento despues del alta hospitalaria.",
        labels: ["Seguimiento de clientes"],
      }),
    ).toBe(true);
    expect(
      hasLocalConceptIdentitySupport({
        localText: "Los pacientes llegan despues del alta hospitalaria.",
        labels: ["Seguimiento de clientes"],
      }),
    ).toBe(false);
  });

  it("detects directional contradictions across domains without fixture vocabulary", () => {
    expect(
      hasDirectionalContradiction(
        "El dolor aumenta cuando se suspende el tratamiento.",
        "La terapia disminuye el dolor despues de una semana.",
      ),
    ).toBe(true);
    expect(
      hasDirectionalContradiction(
        "La caché permite reducir la latencia del endpoint.",
        "La configuración impide reducir la latencia del endpoint.",
      ),
    ).toBe(true);
    expect(
      hasDirectionalContradiction(
        "La sal aumenta la presión arterial.",
        "Reducir la sal disminuye la presión arterial.",
      ),
    ).toBe(true);
    expect(
      hasDirectionalContradiction(
        "La planificación mejora el rendimiento en estudios.",
        "La postergación empeora el rendimiento en estudios.",
      ),
    ).toBe(true);
    expect(
      hasDirectionalContradiction(
        "La escucha activa permite conversaciones difíciles.",
        "La crítica constante impide conversaciones difíciles.",
      ),
    ).toBe(true);
  });

  it("does not treat every opposite verb as a contradiction without shared scope", () => {
    expect(
      hasDirectionalContradiction(
        "El dolor aumenta durante la rehabilitación.",
        "La caché disminuye la latencia del endpoint.",
      ),
    ).toBe(false);
  });

  it("keeps the human bridge generic rather than mining-specific", () => {
    expect(Array.from(HUMAN_ENTITY_TERMS).sort()).toEqual([
      "cliente",
      "clientes",
      "estudiante",
      "estudiantes",
      "paciente",
      "pacientes",
      "peaton",
      "peatones",
      "persona",
      "personas",
      "trabajador",
      "trabajadores",
      "usuario",
      "usuarios",
    ]);
  });
});
