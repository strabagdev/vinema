import { describe, expect, it } from "vitest";
import type { Context } from "@/domain/context/context";
import {
  createCompactConceptIdentityKey,
  deriveConceptAcronym,
  normalizeConceptIdentityLabel,
  normalizeContextAliases,
  resolveConceptIdentity,
} from "@/features/concepts/concept-identity";

describe("concept identity resolution", () => {
  it("normalizes case, accents, punctuation and compact variants without changing visible labels", () => {
    expect(normalizeConceptIdentityLabel(" Operational-Core ")).toBe(
      "operational core",
    );
    expect(normalizeConceptIdentityLabel("OperationalCore")).toBe(
      "operational core",
    );
    expect(normalizeConceptIdentityLabel("Mina El Teniente")).toBe(
      "mina el teniente",
    );
    expect(createCompactConceptIdentityKey("operational-core")).toBe(
      "operationalcore",
    );
  });

  it("resolves canonical exact and normalized canonical labels", () => {
    const contexts = [context({ id: "operational-core", name: "Operational Core" })];

    expect(resolveConceptIdentity("Operational Core", contexts)).toMatchObject({
      status: "EXACT",
      conceptId: "operational-core",
      canonicalLabel: "Operational Core",
    });
    expect(resolveConceptIdentity("operational-core", contexts)).toMatchObject({
      status: "EXACT",
      conceptId: "operational-core",
    });
    expect(resolveConceptIdentity("OperationalCore", contexts)).toMatchObject({
      status: "EXACT",
      conceptId: "operational-core",
    });
  });

  it("resolves exact and normalized aliases to the canonical concept", () => {
    const contexts = [
      context({
        id: "postgresql",
        name: "PostgreSQL",
        aliases: ["Postgres", "PG"],
      }),
    ];

    expect(resolveConceptIdentity("Postgres", contexts)).toMatchObject({
      status: "ALIAS",
      conceptId: "postgresql",
      canonicalLabel: "PostgreSQL",
      matchedAlias: "Postgres",
    });
    expect(resolveConceptIdentity("pg", contexts)).toMatchObject({
      status: "ALIAS",
      conceptId: "postgresql",
      canonicalLabel: "PostgreSQL",
      matchedAlias: "pg",
    });
  });

  it("derives acronyms deterministically and treats conflicts as ambiguous", () => {
    expect(deriveConceptAcronym("Operational Core")).toBe("OC");
    expect(deriveConceptAcronym("Mina Andes Norte")).toBe("MAN");
    expect(deriveConceptAcronym("Access Tracking")).toBe("AT");

    expect(
      resolveConceptIdentity("MAN", [
        context({ id: "mina-andes-norte", name: "Mina Andes Norte" }),
      ]),
    ).toMatchObject({
      status: "ALIAS",
      conceptId: "mina-andes-norte",
      canonicalLabel: "Mina Andes Norte",
      matchedAlias: "MAN",
    });
    expect(
      resolveConceptIdentity("AT", [
        context({ id: "access-tracking", name: "Access Tracking" }),
        context({ id: "andres-tapia", name: "Andres Tapia" }),
      ]),
    ).toMatchObject({
      status: "AMBIGUOUS",
      matchedText: "AT",
    });
  });

  it("does not auto-fuse concepts that only share words", () => {
    expect(
      resolveConceptIdentity("Operational Excellence", [
        context({ id: "operational-core", name: "Operational Core" }),
      ]),
    ).toEqual({ status: "NEW", matchedText: "Operational Excellence" });
  });

  it("normalizes aliases and normalizedAliases on context boundaries", () => {
    expect(
      normalizeContextAliases(
        context({
          aliases: [" OC ", "oc", "Ops-Core"],
          normalizedAliases: ["operational core"],
        }),
      ),
    ).toMatchObject({
      aliases: ["OC", "Ops-Core"],
      normalizedAliases: ["operational core", "oc", "ops core"],
    });
  });
});

function context(overrides: Partial<Context> = {}): Context {
  return {
    id: "context-1",
    workspaceId: "workspace-1",
    type: "AREA",
    name: "Operational Core",
    description: null,
    aliases: [],
    normalizedAliases: [],
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}
