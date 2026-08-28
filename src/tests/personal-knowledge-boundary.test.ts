import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import type { Node } from "@/domain/node/node";
import {
  buildAssociationIndex,
  suggestAssociations,
} from "@/features/associations/association-engine";
import { evaluateCaptureInput } from "@/features/associations/capture-input-evaluation";
import { mergeSemanticAssociationSuggestions } from "@/features/semantic-similarity/semantic-association-integration";

const workspaceId = "workspace-1";

describe("personal knowledge boundary", () => {
  it("starts with no personal knowledge when memory is empty", () => {
    const recovery = suggestAssociations(buildAssociationIndex({ nodes: [] }), {
      text: "rutina semanal",
    });
    const evaluation = evaluateCaptureInput({
      text: "",
      nodes: [],
      contexts: [],
      relations: [],
    });

    expect(recovery).toEqual([]);
    expect(evaluation.conceptSuggestions).toEqual([]);
  });

  it("uses local evidence in Spanish, English and Portuguese without domain seeds", () => {
    const scenarios = [
      {
        id: "es",
        local: "La rutina semanal mantiene foco profundo.",
        memory: "La rutina semanal ordena bloques de foco.",
      },
      {
        id: "en",
        local: "The weekly routine keeps deep focus.",
        memory: "The weekly routine organizes focus blocks.",
      },
      {
        id: "pt",
        local: "A rotina semanal mantém foco profundo.",
        memory: "A rotina semanal organiza blocos de foco.",
      },
    ];

    for (const scenario of scenarios) {
      const suggestions = suggestAssociations(
        buildAssociationIndex({
          nodes: [node({ id: scenario.id, content: scenario.memory })],
        }),
        { text: scenario.local },
      );

      expect(suggestions.map((suggestion) => suggestion.node.id)).toEqual([
        scenario.id,
      ]);
    }
  });

  it("lets invented terms gain meaning from recurrence and co-occurrence", () => {
    const evaluation = evaluateCaptureInput({
      text: "La zorlana clara requiere seguimiento semanal.",
      nodes: [
        node({ id: "z1", content: "Zorlana clara con seguimiento inicial." }),
        node({ id: "z2", content: "Zorlana clara durante revisión semanal." }),
        node({ id: "z3", content: "Zorlana clara para comparar resultados." }),
      ],
      contexts: [],
      relations: [],
    });
    const labels = evaluation.conceptSuggestions.map((suggestion) =>
      suggestion.kind === "existing" ? suggestion.label : suggestion.suggestedLabel,
    );

    expect(labels).toContain("Zorlana clara");
    expect(evaluation.recoveryMatches.map((match) => match.node.id)).toEqual(
      expect.arrayContaining(["z1", "z2", "z3"]),
    );
  });

  it("does not let vector similarity alone include memories", () => {
    const results = mergeSemanticAssociationSuggestions(
      [],
      [
        {
          node: node({
            id: "vector-only",
            content: "Proyecto distante con vocabulario sin anclaje compartido.",
          }),
          evidence: {
            source: "LOCAL_EMBEDDING",
            sourceType: "capture",
            targetType: "capture",
            modelId: "test",
            modelVersion: "1",
            dimensions: 2,
            similarity: 0.98,
            rank: 1,
            marginToNext: null,
          },
        },
      ],
      5,
      "Rutina semanal con foco profundo.",
    );

    expect(results).toEqual([]);
  });

  it("does not give product or domain literals special treatment", () => {
    for (const term of [
      "Mitcom",
      "Railway",
      "Perfume",
      "Sponsor",
      "banco",
      "universidad",
    ]) {
      const evaluation = evaluateCaptureInput({
        text: term,
        nodes: [],
        contexts: [],
        relations: [],
      });

      expect(evaluation.conceptSuggestions).toEqual([]);
    }
  });

  it("keeps the cognitive and semantic core free of default linguistic or domain seeds", () => {
    const root = process.cwd();
    const scannedRoots = [
      "src/features/associations",
      "src/features/cognition",
      "src/features/concepts",
      "src/features/semantic-similarity",
      "src/features/semantics",
    ];
    const allowedInterfaceOrFixtureFiles = new Set([
      "src/features/associations/capture-recovery-results.tsx",
      "src/features/associations/concept-suggestion-chips.tsx",
    ]);
    const allowedStructuralLinguisticCollections = new Set([
      "LOCAL_CONCEPT_ACTION_TERMS",
      "LOCAL_CONCEPT_WEAK_BOUNDARY_TERMS",
      "LOCAL_CONCEPT_INVALID_CONNECTORS",
      "DEPENDENT_START_TOKENS",
      "INCOMPLETE_BOUNDARY_TOKENS",
    ]);
    const forbiddenPatterns = [
      /\bSPANISH_STOPWORDS\b/u,
      /\bspanish-stopwords\b/u,
      /from\s+["'][^"']*(?:language-profile|stopwords?|lexicons?|dictionaries|vocabular(?:y|ies))[^"']*["']/iu,
      /\b(?:HUMAN|PERSON|PEOPLE|DIRECTION|NEGATION|UNCERTAINTY|GENERIC|KNOWN|NOUN|VERB|ADJECTIVE|ADVERB|CONNECTOR|ARTICLE|DETERMINER|SYNONYM|LEXICON|STOPWORD)[A-Z0-9_]*(?:TERMS|WORDS|LABELS|PATTERNS|EXPRESSIONS|SUFFIXES|PREFIXES|MARKERS)\b/u,
      /\b(cion|sion|miento|mente|ando|iendo|ais|eis|amos|emos|imos)\b/u,
    ];
    const offenders = scannedRoots.flatMap((scannedRoot) =>
      listSourceFiles(join(root, scannedRoot)).flatMap((file) => {
        const sourcePath = relative(root, file);
        if (allowedInterfaceOrFixtureFiles.has(sourcePath)) {
          return [];
        }

        const content = readFileSync(file, "utf8");

        const directMatches = forbiddenPatterns.flatMap((pattern) =>
          pattern.test(content) &&
            !isAllowedStructuralLinguisticPattern(sourcePath, pattern)
            ? [`${sourcePath} contains ${pattern.source}`]
            : [],
        );
        const forbiddenImports = findForbiddenLexiconImports(content).map(
          (modulePath) => `${sourcePath} imports lexicon ${modulePath}`,
        );
        const lexicalCollections = findLexicalCollections(content)
          .filter((name) => !allowedStructuralLinguisticCollections.has(name))
          .map(
          (name) => `${sourcePath} defines lexical collection ${name}`,
        );
        const literalWordCollections = findLiteralWordCollections(content)
          .filter((name) => !allowedStructuralLinguisticCollections.has(name))
          .map(
          (name) => `${sourcePath} defines literal word collection ${name}`,
        );
        const linguisticRegexes = findLinguisticRegexes(content).map(
          (pattern) => `${sourcePath} defines linguistic regex ${pattern}`,
        );

        return [
          ...directMatches,
          ...forbiddenImports,
          ...lexicalCollections,
          ...literalWordCollections,
          ...linguisticRegexes,
        ];
      }),
    );

    expect(offenders).toEqual([]);
  });
});

function node({
  id,
  content,
}: {
  id: string;
  content: string;
}): Node {
  return {
    id,
    workspaceId,
    type: "NOTE",
    content,
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    archivedAt: null,
    createdByDeviceId: "device-1",
    lastModifiedByDeviceId: "device-1",
  };
}

function findForbiddenLexiconImports(content: string) {
  return Array.from(
    content.matchAll(/\bfrom\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/gu),
    (match) => match[1] ?? match[2] ?? "",
  ).filter((modulePath) =>
    /(?:language-profile|stopwords?|lexicons?|dictionaries|vocabular(?:y|ies))/iu.test(
      modulePath,
    ),
  );
}

function isAllowedStructuralLinguisticPattern(sourcePath: string, pattern: RegExp) {
  return (
    sourcePath === "src/features/semantics/semantic-phrase-extractor.ts" &&
    pattern.source === "\\b(cion|sion|miento|mente|ando|iendo|ais|eis|amos|emos|imos)\\b"
  );
}

function findLexicalCollections(content: string) {
  const collectionPattern =
    /\b(?:const|export\s+const)\s+([A-Za-z0-9_]*(?:words|terms|verbs|connectors|articles|determiners|markers|patterns|expressions|synonyms|lexicon|stopwords|suffixes|prefixes)[A-Za-z0-9_]*)\b\s*(?::[^=;]+)?=\s*(?:\[[\s\S]*?\]|new\s+(?:Set|Map)\s*\(\s*\[[\s\S]*?\]\s*\))/giu;
  const offenders: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = collectionPattern.exec(content)) !== null) {
    const declaration = match[0];
    const hasWordLiterals = /["'][\p{L}][\p{L}\p{M}\s-]*["']/u.test(declaration);

    if (hasWordLiterals) {
      offenders.push(match[1] ?? "unknown");
    }
  }

  return offenders;
}

function findLiteralWordCollections(content: string) {
  const collectionPattern =
    /\b(?:const|export\s+const)\s+([A-Za-z0-9_]+)\s*(?::[^=]+)?=\s*(?:\[[\s\S]*?\]|new\s+(?:Set|Map)\s*\(\s*\[[\s\S]*?\]\s*\))/gu;
  const offenders: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = collectionPattern.exec(content)) !== null) {
    const declaration = match[0];
    const literals = Array.from(
      declaration.matchAll(/["'`]([^"'`]+)["'`]/gu),
      (literalMatch) => literalMatch[1] ?? "",
    );
    const naturalWordLiterals = literals.filter(isNaturalWordLiteral);

    if (naturalWordLiterals.length >= 3) {
      offenders.push(match[1] ?? "unknown");
    }
  }

  return offenders;
}

function findLinguisticRegexes(content: string) {
  return Array.from(content.matchAll(/\/([^/\n\\]*(?:\\.[^/\n\\]*)*)\/[a-z]*/gu))
    .map((match) => match[1] ?? "")
    .filter((pattern) => {
      const letterAlternatives = pattern.match(/\(([\p{L}|]{5,})\)/u)?.[1]
        .split("|")
        .filter((part) => /^[\p{L}\p{M}]{2,}$/u.test(part)) ?? [];

      return letterAlternatives.length >= 3;
    });
}

function isNaturalWordLiteral(value: string) {
  return (
    /^[\p{L}\p{M}]+(?:[\s-][\p{L}\p{M}]+)*$/u.test(value) &&
    !/^[A-Z0-9_]+$/u.test(value)
  );
}

function listSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      return listSourceFiles(fullPath);
    }

    return /\.(ts|tsx)$/u.test(entry) ? [fullPath] : [];
  });
}
