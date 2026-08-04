import { describe, expect, it } from "vitest";
import type { ExistingConceptSuggestion } from "@/features/associations/association-types";
import { getUsefulDetectedAlias } from "@/features/associations/concept-alias-display";

describe("concept alias display", () => {
  it("shows aliases only when they clarify a distinct canonical identity", () => {
    expect(
      getUsefulDetectedAlias(suggestion({ label: "Operational Core", matchedAlias: "OC" })),
    ).toBe("OC");
    expect(
      getUsefulDetectedAlias(
        suggestion({ label: "PostgreSQL", matchedAlias: "Postgres" }),
      ),
    ).toBe("Postgres");
  });

  it("hides stop words, empty aliases and canonical equivalents", () => {
    expect(getUsefulDetectedAlias(suggestion({ label: "Agosto", matchedAlias: "a" })))
      .toBeNull();
    expect(
      getUsefulDetectedAlias(
        suggestion({ label: "Estado de pago", matchedAlias: "Estado de pago" }),
      ),
    ).toBeNull();
    expect(
      getUsefulDetectedAlias(
        suggestion({ label: "Estado de pago", matchedAlias: "estado-de-pago" }),
      ),
    ).toBeNull();
    expect(getUsefulDetectedAlias(suggestion({ label: "Mitcom", matchedAlias: "" })))
      .toBeNull();
  });
});

function suggestion({
  label,
  matchedAlias,
}: {
  label: string;
  matchedAlias: string;
}): ExistingConceptSuggestion {
  return {
    kind: "existing",
    context: {
      id: label,
      workspaceId: "workspace-1",
      type: "AREA",
      name: label,
      description: null,
      aliases: [],
      normalizedAliases: [],
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      archivedAt: null,
    },
    conceptId: label,
    label,
    score: 1,
    evidenceCaptureIds: [],
    matchedTerms: [],
    matchedAlias,
  };
}
