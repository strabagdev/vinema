import type { Context } from "@/domain/context/context";
import type { ContextRepository } from "@/domain/context/context-repository";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { NodeContextRelationRepository } from "@/domain/context/node-context-relation-repository";
import type { NodeRepository } from "@/domain/node/node-repository";
import { normalizeAssociationText } from "@/features/associations/normalize-text";
import {
  tokenizeAssociationText,
  uniqueTokens,
} from "@/features/associations/tokenize";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";

export const CONCEPT_LABEL_NORMALIZATION_KEY =
  "vinema:concept-label-normalization:v1";

export type ConceptLabelNormalizationCandidate = {
  labels: string[];
  equivalenceKey: string;
  canonicalLabel: string | null;
  action: "merged" | "renamed" | "skipped";
  reason: string;
};

export type ConceptLabelNormalizationDiagnostics = {
  persistedConceptCount: number;
  equivalenceCandidateCount: number;
  mergedConceptCount: number;
  renamedConceptCount: number;
  skippedAmbiguousCount: number;
  transferredRelationCount: number;
  duplicateRelationCount: number;
  normalizationMs: number;
  candidates: ConceptLabelNormalizationCandidate[];
};

export async function normalizePersistedConceptLabels({
  workspaceId,
  contextRepository,
  relationRepository,
  nodeRepository,
  storage,
}: {
  workspaceId: string;
  contextRepository: ContextRepository;
  relationRepository: NodeContextRelationRepository;
  nodeRepository: NodeRepository;
  storage?: StorageAdapter;
}): Promise<ConceptLabelNormalizationDiagnostics> {
  const startedAt = performance.now();
  const diagnostics: ConceptLabelNormalizationDiagnostics = {
    persistedConceptCount: 0,
    equivalenceCandidateCount: 0,
    mergedConceptCount: 0,
    renamedConceptCount: 0,
    skippedAmbiguousCount: 0,
    transferredRelationCount: 0,
    duplicateRelationCount: 0,
    normalizationMs: 0,
    candidates: [],
  };
  const contexts = await contextRepository.list({
    workspaceId,
    includeArchived: false,
  });
  const groups = groupContextsByEquivalenceKey(contexts);

  diagnostics.persistedConceptCount = contexts.length;

  for (const [equivalenceKey, groupedContexts] of groups.entries()) {
    const relatedRelations = await listRelationsForContexts(
      relationRepository,
      groupedContexts,
    );
    const canonicalLabel = await findCanonicalLabelFromEvidence({
      equivalenceKey,
      relations: relatedRelations,
      nodeRepository,
    });

    if (groupedContexts.length === 1) {
      const [context] = groupedContexts;
      const currentKey = normalizeExpressionKey(context.name);

      if (canonicalLabel && currentKey !== normalizeExpressionKey(canonicalLabel)) {
        await contextRepository.save({
          ...context,
          name: canonicalLabel,
          updatedAt: new Date().toISOString(),
        });
        diagnostics.renamedConceptCount += 1;
        diagnostics.candidates.push({
          labels: [context.name],
          equivalenceKey,
          canonicalLabel,
          action: "renamed",
          reason: "La evidencia asociada repite una expresion canonica distinta.",
        });
      }

      continue;
    }

    diagnostics.equivalenceCandidateCount += 1;

    if (!canonicalLabel) {
      diagnostics.skippedAmbiguousCount += 1;
      diagnostics.candidates.push({
        labels: groupedContexts.map((context) => context.name),
        equivalenceKey,
        canonicalLabel: null,
        action: "skipped",
        reason: "No hay evidencia textual suficiente para elegir un orden natural.",
      });
      continue;
    }

    const canonicalContext = chooseCanonicalContext(groupedContexts, canonicalLabel);
    const duplicateContexts = groupedContexts.filter(
      (context) => context.id !== canonicalContext.id,
    );
    const renamedCanonical =
      normalizeExpressionKey(canonicalContext.name) !==
      normalizeExpressionKey(canonicalLabel);

    if (renamedCanonical) {
      await contextRepository.save({
        ...canonicalContext,
        name: canonicalLabel,
        updatedAt: new Date().toISOString(),
      });
      diagnostics.renamedConceptCount += 1;
    }

    for (const duplicateContext of duplicateContexts) {
      const result = await transferRelationsToCanonical({
        relationRepository,
        duplicateContext,
        canonicalContext,
      });
      diagnostics.transferredRelationCount += result.transferredRelationCount;
      diagnostics.duplicateRelationCount += result.duplicateRelationCount;
      await archiveMergedContext({
        contextRepository,
        duplicateContext,
        canonicalContext,
        canonicalLabel,
      });
      diagnostics.mergedConceptCount += 1;
    }

    diagnostics.candidates.push({
      labels: groupedContexts.map((context) => context.name),
      equivalenceKey,
      canonicalLabel,
      action: "merged",
      reason: "Los conceptos comparten terminos y la evidencia repite el mismo orden natural.",
    });
  }

  diagnostics.normalizationMs = Math.round(performance.now() - startedAt);
  await storage?.set(CONCEPT_LABEL_NORMALIZATION_KEY, {
    executedAt: new Date().toISOString(),
    version: 1,
    diagnostics,
  });

  return diagnostics;
}

export function createConceptEquivalenceKey(label: string): string {
  return uniqueTokens(tokenizeAssociationText(label)).sort().join("|");
}

function groupContextsByEquivalenceKey(contexts: Context[]) {
  const groups = new Map<string, Context[]>();

  for (const context of contexts) {
    const key = createConceptEquivalenceKey(context.name);

    if (!key) {
      continue;
    }

    groups.set(key, [...(groups.get(key) ?? []), context]);
  }

  return groups;
}

async function listRelationsForContexts(
  relationRepository: NodeContextRelationRepository,
  contexts: Context[],
) {
  const relations = await Promise.all(
    contexts.map((context) => relationRepository.listByContextId(context.id)),
  );

  return relations.flat();
}

async function findCanonicalLabelFromEvidence({
  equivalenceKey,
  relations,
  nodeRepository,
}: {
  equivalenceKey: string;
  relations: NodeContextRelation[];
  nodeRepository: NodeRepository;
}) {
  const phraseCounts = new Map<string, { label: string; count: number }>();

  for (const relation of relations) {
    const node = await nodeRepository.findById(relation.nodeId);

    if (!node) {
      continue;
    }

    const phrases = extractEquivalentPhrases(node.content, equivalenceKey);

    for (const phrase of phrases) {
      const key = normalizeExpressionKey(phrase);
      const current = phraseCounts.get(key);

      if (current) {
        current.count += 1;
      } else {
        phraseCounts.set(key, { label: phrase, count: 1 });
      }
    }
  }

  const candidates = Array.from(phraseCounts.values()).sort((first, second) => {
    return (
      second.count - first.count ||
      Number(hasNaturalCapitalization(second.label)) -
        Number(hasNaturalCapitalization(first.label)) ||
      first.label.localeCompare(second.label)
    );
  });
  const [best, second] = candidates;

  if (!best || best.count < 2) {
    return null;
  }

  if (second && second.count === best.count) {
    return null;
  }

  return formatCanonicalLabel(best.label);
}

function extractEquivalentPhrases(text: string, equivalenceKey: string) {
  const words = extractWords(text);
  const targetTokenCount = equivalenceKey.split("|").filter(Boolean).length;
  const phrases: string[] = [];

  if (targetTokenCount < 1) {
    return phrases;
  }

  for (let index = 0; index <= words.length - targetTokenCount; index += 1) {
    const phraseWords = words.slice(index, index + targetTokenCount);
    const phrase = phraseWords.join(" ");

    if (createConceptEquivalenceKey(phrase) === equivalenceKey) {
      phrases.push(phrase);
    }
  }

  return phrases;
}

function chooseCanonicalContext(contexts: Context[], canonicalLabel: string) {
  const exact = contexts.find(
    (context) =>
      normalizeExpressionKey(context.name) === normalizeExpressionKey(canonicalLabel),
  );

  if (exact) {
    return exact;
  }

  return [...contexts].sort((first, second) => {
    return (
      Date.parse(first.createdAt) - Date.parse(second.createdAt) ||
      first.id.localeCompare(second.id)
    );
  })[0];
}

async function transferRelationsToCanonical({
  relationRepository,
  duplicateContext,
  canonicalContext,
}: {
  relationRepository: NodeContextRelationRepository;
  duplicateContext: Context;
  canonicalContext: Context;
}) {
  let transferredRelationCount = 0;
  let duplicateRelationCount = 0;
  const relations = await relationRepository.listByContextId(duplicateContext.id);

  for (const relation of relations) {
    const existingRelation = await relationRepository.getByNodeAndContext(
      relation.nodeId,
      canonicalContext.id,
    );

    if (existingRelation) {
      await relationRepository.delete(relation.id);
      duplicateRelationCount += 1;
      continue;
    }

    await relationRepository.save({
      ...relation,
      id: crypto.randomUUID(),
      contextId: canonicalContext.id,
    });
    await relationRepository.delete(relation.id);
    transferredRelationCount += 1;
  }

  return { transferredRelationCount, duplicateRelationCount };
}

async function archiveMergedContext({
  contextRepository,
  duplicateContext,
  canonicalContext,
  canonicalLabel,
}: {
  contextRepository: ContextRepository;
  duplicateContext: Context;
  canonicalContext: Context;
  canonicalLabel: string;
}) {
  if (duplicateContext.archivedAt) {
    return;
  }

  const now = new Date().toISOString();
  const mergeNote = `Fusionado en ${canonicalLabel} (${canonicalContext.id}).`;
  const description = duplicateContext.description
    ? `${duplicateContext.description}\n${mergeNote}`
    : mergeNote;

  await contextRepository.archive({
    ...duplicateContext,
    description,
    archivedAt: now,
    updatedAt: now,
  });
}

function extractWords(text: string) {
  return Array.from(text.matchAll(/[\p{L}\p{N}]+/gu), (match) => match[0]);
}

function normalizeExpressionKey(label: string) {
  return normalizeAssociationText(label).replace(/\s+/g, " ").trim();
}

function formatCanonicalLabel(label: string) {
  const normalized = label.replace(/\s+/g, " ").trim();

  if (hasNaturalCapitalization(normalized)) {
    return normalized;
  }

  return normalized.charAt(0).toLocaleUpperCase("es") + normalized.slice(1);
}

function hasNaturalCapitalization(label: string) {
  const words = extractWords(label);
  return words.filter((word) => word !== word.toLocaleLowerCase("es")).length >= 2;
}
