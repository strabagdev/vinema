import type {
  ConceptEvidenceRecord,
  ConceptMemorySeries,
  MemoryEvidenceModel,
} from "@/features/cognition/memory-evidence/memory-evidence-model";
import { latestEvidenceNodeIds } from "@/features/cognition/memory-evidence/memory-evidence-model";
import { getCapturePreview } from "@/features/node/node-display";
import {
  createEmbeddingSourceHash,
  normalizeEmbeddingText,
} from "@/features/semantic-similarity/embedding-text";

export const CONCEPT_REPRESENTATION_VERSION = 2;
const REPRESENTATIVE_EVIDENCE_LIMIT = 5;
const REPRESENTATIVE_EXCERPT_LENGTH = 190;

export type ConceptSemanticRepresentation = {
  conceptId: string;
  representationVersion: number;
  text: string;
  identityText: string;
  evidenceText: string;
  sourceHash: string;
  evidenceNodeIds: string[];
};

export function buildConceptSemanticRepresentations(
  model: MemoryEvidenceModel,
): ConceptSemanticRepresentation[] {
  return Array.from(model.conceptSeriesById.values())
    .map((series) => buildConceptSemanticRepresentation(model, series))
    .filter(
      (
        representation,
      ): representation is ConceptSemanticRepresentation =>
        representation !== null,
    )
    .sort((first, second) => first.conceptId.localeCompare(second.conceptId));
}

export function buildConceptSemanticRepresentation(
  model: MemoryEvidenceModel,
  series: ConceptMemorySeries,
): ConceptSemanticRepresentation | null {
  const record = model.conceptsById.get(series.conceptId);

  if (!record || series.evidenceNodeIds.length === 0) {
    return null;
  }

  const aliases = getConceptAliases(record);
  const evidenceNodeIds = selectRepresentativeEvidenceNodeIds(series);
  const evidenceByNodeId = new Map(
    model.evidenceNodes.map((evidence) => [evidence.nodeId, evidence]),
  );
  const evidenceLines = evidenceNodeIds
    .map((nodeId) => evidenceByNodeId.get(nodeId)?.node.content ?? "")
    .map((content) => normalizeEmbeddingText(
      getCapturePreview(content, { maxLength: REPRESENTATIVE_EXCERPT_LENGTH }),
    ))
    .filter(Boolean);
  const identitySections = [
    `Nombre: ${record.canonicalLabel}`,
    aliases.length > 0 ? `Aliases: ${aliases.join(", ")}` : null,
  ].filter((section): section is string => Boolean(section));
  const evidenceText = normalizeEmbeddingText(
    evidenceLines.length > 0
      ? `Evidencia:\n${evidenceLines.map((line) => `- ${line}`).join("\n")}`
      : "",
  );
  const identityText = normalizeEmbeddingText(identitySections.join("\n"));
  const text = identityText;

  if (!text) {
    return null;
  }

  return {
    conceptId: series.conceptId,
    representationVersion: CONCEPT_REPRESENTATION_VERSION,
    text,
    identityText,
    evidenceText,
    sourceHash: createEmbeddingSourceHash(
      [
        `concept-representation-v${CONCEPT_REPRESENTATION_VERSION}`,
        identityText,
        evidenceText,
      ].join("\n"),
    ),
    evidenceNodeIds,
  };
}

function getConceptAliases(record: ConceptEvidenceRecord) {
  return Array.from(
    new Set([
      ...(record.context.aliases ?? []),
      ...(record.context.normalizedAliases ?? []),
    ]),
  )
    .map(normalizeEmbeddingText)
    .filter((alias) => alias && alias !== record.canonicalLabel)
    .sort((first, second) => first.localeCompare(second));
}

function selectRepresentativeEvidenceNodeIds(series: ConceptMemorySeries) {
  const selected = [
    ...latestEvidenceNodeIds(
      series.recentEvidenceNodeIds,
      series.timestampByNodeId,
      2,
    ),
    ...latestEvidenceNodeIds(
      series.evidenceNodeIds,
      series.timestampByNodeId,
      REPRESENTATIVE_EVIDENCE_LIMIT,
    ),
  ];

  return Array.from(new Set(selected))
    .sort(
      (first, second) =>
        (series.timestampByNodeId.get(second) ?? 0) -
          (series.timestampByNodeId.get(first) ?? 0) ||
        first.localeCompare(second),
    )
    .slice(0, REPRESENTATIVE_EVIDENCE_LIMIT);
}
