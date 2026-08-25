import { describe, expect, it } from "vitest";
import {
  hasDirectionalContradiction,
  hasLocalConceptIdentitySupport,
  hasMeaningfulLocalTokenOverlap,
} from "@/features/associations/local-support";

describe("local semantic support", () => {
  it("uses exact identity support across non-mining domains", () => {
    expect(
      hasLocalConceptIdentitySupport({
        localText: "El paciente reporta dolor crónico despues del tratamiento.",
        labels: ["Dolor crónico"],
      }),
    ).toBe(true);
    expect(
      hasLocalConceptIdentitySupport({
        localText: "La caché reduce latencia en consultas frecuentes.",
        labels: ["Caché"],
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
        labels: ["Acuerdos claros"],
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

  it("does not treat functional or directional words as standalone memory support", () => {
    expect(
      hasMeaningfulLocalTokenOverlap(
        "Antes de empezar mantener la rutina redujo el tiempo y mejoró la energía.",
        "Antes de revisar mantener la pauta redujo esperas y mejoró el orden.",
      ),
    ).toBe(false);
    expect(
      hasMeaningfulLocalTokenOverlap(
        "Mantener horario regular mejoró el descanso.",
        "Mantener horario regular ayuda a ordenar la rutina.",
      ),
    ).toBe(true);
  });

  it("does not let shared human categories become standalone support", () => {
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

  it("does not bridge different human terms without exact thematic support", () => {
    expect(
      hasLocalConceptIdentitySupport({
        localText:
          "Los pacientes requieren seguimiento despues del alta hospitalaria.",
        labels: ["Seguimiento de clientes"],
      }),
    ).toBe(false);
    expect(
      hasLocalConceptIdentitySupport({
        localText: "Los pacientes llegan despues del alta hospitalaria.",
        labels: ["Seguimiento de clientes"],
      }),
    ).toBe(false);
  });

  it("does not derive contradictions from predefined directional verb groups", () => {
    expect(
      hasDirectionalContradiction(
        "El dolor aumenta cuando se suspende el tratamiento.",
        "La terapia disminuye el dolor despues de una semana.",
      ),
    ).toBe(false);
    expect(
      hasDirectionalContradiction(
        "La caché permite reducir la latencia del endpoint.",
        "La configuración impide reducir la latencia del endpoint.",
      ),
    ).toBe(false);
    expect(
      hasDirectionalContradiction(
        "La sal aumenta la presión arterial.",
        "Reducir la sal disminuye la presión arterial.",
      ),
    ).toBe(false);
    expect(
      hasDirectionalContradiction(
        "La planificación mejora el rendimiento en estudios.",
        "La postergación empeora el rendimiento en estudios.",
      ),
    ).toBe(false);
    expect(
      hasDirectionalContradiction(
        "La escucha activa permite conversaciones difíciles.",
        "La crítica constante impide conversaciones difíciles.",
      ),
    ).toBe(false);
  });

  it("does not treat every opposite verb as a contradiction without shared scope", () => {
    expect(
      hasDirectionalContradiction(
        "El dolor aumenta durante la rehabilitación.",
        "La caché disminuye la latencia del endpoint.",
      ),
    ).toBe(false);
  });

});
