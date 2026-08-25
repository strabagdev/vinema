import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { getContentTimestamp } from "@/features/capture/capture-timestamps";
import {
  deriveBehavioralPatterns,
  type BehavioralPattern,
} from "@/features/cognition/behavioral-engine/behavioral-engine";
import type { MemoryEvidenceModel } from "@/features/cognition/memory-evidence/memory-evidence-model";
import {
  EXPLICIT_SEMANTIC_PATTERNS,
  type SemanticRelationKind,
} from "@/features/cognition/semantic-understanding/semantic-patterns";
import {
  aggregateSemanticStatements,
  type SemanticStatement,
  type SemanticStatementCandidate,
} from "@/features/cognition/semantic-understanding/semantic-statements";
import { createConceptIdentity, normalizeConceptIdentityLabel } from "@/features/concepts/concept-identity";
import { getCapturePreview } from "@/features/node/node-display";

export interface DeriveSemanticStatementsOptions {
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
  now?: Date;
  evidenceModel?: MemoryEvidenceModel;
}

interface ConceptRecord {
  context: Context;
  labels: string[];
  normalizedLabels: string[];
}

interface SentenceSpan {
  text: string;
  start: number;
  end: number;
}

interface ConceptMention {
  conceptId: string;
  label: string;
  start: number;
  end: number;
  matchedText: string;
}

export function deriveSemanticStatements({
  contexts,
  relations,
  nodes,
  now = new Date(),
  evidenceModel,
}: DeriveSemanticStatementsOptions): SemanticStatement[] {
  return aggregateSemanticStatements([
    ...detectExplicitSemanticStatements({ contexts, relations, nodes }),
    ...deriveContextualSemanticCandidates({
      contexts,
      relations,
      nodes,
      now,
      evidenceModel,
    }),
  ]);
}

export function detectExplicitSemanticStatements({
  contexts,
  relations,
  nodes,
}: Omit<DeriveSemanticStatementsOptions, "now">): SemanticStatementCandidate[] {
  const activeNodesById = new Map(
    nodes
      .filter((node) => node.deletedAt === null)
      .map((node) => [node.id, node]),
  );
  const conceptRecords = getConceptRecords(contexts);
  const acceptedConceptIdsByNodeId = getAcceptedConceptIdsByNodeId({
    relations,
    activeNodesById,
    conceptRecords,
  });
  const candidates: SemanticStatementCandidate[] = [];

  for (const [nodeId, acceptedConceptIds] of acceptedConceptIdsByNodeId.entries()) {
    const node = activeNodesById.get(nodeId);

    if (!node || acceptedConceptIds.length < 2) {
      continue;
    }

    for (const sentence of splitSentences(node.content)) {
      candidates.push(
        ...detectStatementsInSentence({
          node,
          sentence,
          acceptedConceptIds,
          conceptRecords,
        }),
      );
    }
  }

  return candidates;
}

function detectStatementsInSentence({
  node,
  sentence,
  acceptedConceptIds,
  conceptRecords,
}: {
  node: Node;
  sentence: SentenceSpan;
  acceptedConceptIds: string[];
  conceptRecords: Map<string, ConceptRecord>;
}): SemanticStatementCandidate[] {
  const mentions = findConceptMentions({
    sentence,
    acceptedConceptIds,
    conceptRecords,
  });
  const candidates: SemanticStatementCandidate[] = [];

  if (EXPLICIT_SEMANTIC_PATTERNS.length === 0) {
    return candidates;
  }

  for (const source of mentions) {
    for (const target of mentions) {
      if (source.conceptId === target.conceptId || source.end >= target.start) {
        continue;
      }

      const between = sentence.text.slice(source.end, target.start);
      const match = matchSemanticExpression(between);

      if (!match) {
        continue;
      }

      candidates.push({
        sourceConceptId: source.conceptId,
        sourceLabel: source.label,
        relation: match.relation,
        targetConceptId: target.conceptId,
        targetLabel: target.label,
        evidenceLevel: "EXPLICIT",
        negative: match.negative,
        evidence: {
          nodeId: node.id,
          excerpt: getCapturePreview(sentence.text, { maxLength: 190 }),
          createdAt: new Date(getContentTimestamp(node)),
          matchedExpression: match.matchedExpression,
        },
      });
    }
  }

  return candidates;
}

function deriveContextualSemanticCandidates({
  contexts,
  relations,
  nodes,
  now,
  evidenceModel,
}: DeriveSemanticStatementsOptions & { now: Date }): SemanticStatementCandidate[] {
  const conceptsById = new Map(contexts.map((context) => [context.id, context]));
  const activeNodesById = new Map(
    nodes
      .filter((node) => node.deletedAt === null)
      .map((node) => [node.id, node]),
  );

  return deriveBehavioralPatterns({ contexts, relations, nodes, now, evidenceModel })
    .filter(shouldCreateContextualCandidate)
    .flatMap((pattern) => contextualCandidatesForPattern(pattern, conceptsById, activeNodesById));
}

function shouldCreateContextualCandidate(pattern: BehavioralPattern) {
  return (
    pattern.conceptIds.length === 2 &&
    pattern.strength !== "WEAK" &&
    (pattern.kind === "RECURRENT_PAIR" || pattern.kind === "STABLE_RELATIONSHIP")
  );
}

function contextualCandidatesForPattern(
  pattern: BehavioralPattern,
  conceptsById: Map<string, Context>,
  activeNodesById: Map<string, Node>,
): SemanticStatementCandidate[] {
  const [sourceConceptId, targetConceptId] = pattern.conceptIds;
  const source = conceptsById.get(sourceConceptId);
  const target = conceptsById.get(targetConceptId);
  const evidence = pattern.evidenceNodeIds
    .map((nodeId) => activeNodesById.get(nodeId) ?? null)
    .filter((node): node is Node => node !== null)
    .slice(0, 3);

  if (!source || !target || evidence.length === 0) {
    return [];
  }

  return evidence.map((node) => ({
    sourceConceptId,
    sourceLabel: source.name,
    relation: "RELATED_TO",
    targetConceptId,
    targetLabel: target.name,
    evidenceLevel: "CONTEXTUAL",
    evidence: {
      nodeId: node.id,
      excerpt: getCapturePreview(node.content, { maxLength: 190 }),
      createdAt: new Date(getContentTimestamp(node)),
      matchedExpression: "asociación contextual recurrente",
    },
  }));
}

function getConceptRecords(contexts: Context[]) {
  const records = new Map<string, ConceptRecord>();

  for (const context of contexts) {
    const identity = createConceptIdentity(context);
    const labels = [
      identity.canonicalLabel,
      ...identity.aliases,
      ...identity.normalizedAliases,
    ]
      .filter(Boolean)
      .sort((first, second) => second.length - first.length || first.localeCompare(second));
    const normalizedLabels = labels
      .map(normalizeConceptIdentityLabel)
      .filter(Boolean);

    records.set(context.id, { context, labels, normalizedLabels });
  }

  return records;
}

function getAcceptedConceptIdsByNodeId({
  relations,
  activeNodesById,
  conceptRecords,
}: {
  relations: NodeContextRelation[];
  activeNodesById: Map<string, Node>;
  conceptRecords: Map<string, ConceptRecord>;
}) {
  const conceptIdsByNodeId = new Map<string, string[]>();
  const identityLabelsByNodeId = new Map<string, Set<string>>();

  for (const relation of relations) {
    if (
      relation.relationType === "CAPTURE_ASSOCIATION" ||
      !activeNodesById.has(relation.nodeId)
    ) {
      continue;
    }

    const record = conceptRecords.get(relation.contextId);

    if (!record) {
      continue;
    }

    const used = identityLabelsByNodeId.get(relation.nodeId) ?? new Set<string>();
    if (record.normalizedLabels.some((label) => used.has(label))) {
      continue;
    }

    for (const label of record.normalizedLabels) {
      used.add(label);
    }

    identityLabelsByNodeId.set(relation.nodeId, used);
    conceptIdsByNodeId.set(relation.nodeId, [
      ...(conceptIdsByNodeId.get(relation.nodeId) ?? []),
      relation.contextId,
    ]);
  }

  return conceptIdsByNodeId;
}

function splitSentences(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  const regex = /[^.!?¿?]+[.!?]?/gu;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    const trimmed = raw.trim();

    if (!trimmed) {
      continue;
    }

    const leadingWhitespace = raw.search(/\S/u);
    const start = match.index + Math.max(0, leadingWhitespace);

    spans.push({
      text: trimmed,
      start,
      end: start + trimmed.length,
    });
  }

  return spans;
}

function findConceptMentions({
  sentence,
  acceptedConceptIds,
  conceptRecords,
}: {
  sentence: SentenceSpan;
  acceptedConceptIds: string[];
  conceptRecords: Map<string, ConceptRecord>;
}) {
  const mentions: ConceptMention[] = [];

  for (const conceptId of acceptedConceptIds) {
    const record = conceptRecords.get(conceptId);

    if (!record) {
      continue;
    }

    for (const label of record.labels) {
      const match = findLabel(sentence.text, label);

      if (!match) {
        continue;
      }

      mentions.push({
        conceptId,
        label: record.context.name,
        start: match.start,
        end: match.end,
        matchedText: match.matchedText,
      });
      break;
    }
  }

  return mentions.sort((first, second) => first.start - second.start || second.end - first.end);
}

function findLabel(sentence: string, label: string) {
  const visibleLabel = label.trim();

  if (!visibleLabel) {
    return null;
  }

  const escaped = visibleLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  );
  const match = regex.exec(sentence);

  if (!match) {
    return null;
  }

  const prefix = match[1] ?? "";
  const matchedText = match[2] ?? visibleLabel;
  const start = match.index + prefix.length;

  return {
    start,
    end: start + matchedText.length,
    matchedText,
  };
}

function matchSemanticExpression(value: string): {
  relation: SemanticRelationKind;
  matchedExpression: string;
  negative: boolean;
} | null {
  const normalized = normalizeExpression(value);

  for (const pattern of EXPLICIT_SEMANTIC_PATTERNS) {
    const matched = pattern.expressions.find(
      (candidate) => normalizeExpression(candidate) === normalized,
    );

    if (matched) {
      return {
        relation: pattern.relation,
        matchedExpression: matched,
        negative: false,
      };
    }
  }

  return null;
}

function normalizeExpression(value: string) {
  return normalizeConceptIdentityLabel(value);
}
