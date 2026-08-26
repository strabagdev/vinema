import type { Concept } from "@/domain/concept/concept";
import {
  CONTEXT_TYPES,
  isConceptType,
  normalizeConceptNameForComparison,
} from "@/domain/context/context";
import type { ConceptRepository } from "@/domain/concept/concept-repository";
import type { CaptureConceptRelation } from "@/domain/concept/capture-concept-relation";
import type { CaptureConceptRelationRepository } from "@/domain/concept/capture-concept-relation-repository";
import type { Capture } from "@/domain/capture/capture";
import type { CaptureRepository } from "@/domain/capture/capture-repository";
import type { Workspace } from "@/domain/workspace/workspace";
import { createConceptEquivalenceKey } from "@/features/associations/concept-label-normalization";
import {
  normalizeConceptIdentityLabel,
  normalizeContextAliases,
  resolveConceptIdentity,
} from "@/features/concepts/concept-identity";
import { emitSyncDataChanged } from "@/features/sync/sync-data-events";

export const KNOWLEDGE_BACKUP_FORMAT = "vinema-knowledge-backup";
export const KNOWLEDGE_BACKUP_VERSION = 1;
export const MEMORY_BACKUP_FORMAT = "vinema-memory-backup";
export const MEMORY_BACKUP_VERSION = 2;
export const MAX_KNOWLEDGE_BACKUP_BYTES = 5 * 1024 * 1024;

const SENSITIVE_KEY_PATTERN =
  /token|secret|password|credential|session|apikey|api_key|hash/i;

export type KnowledgeBackupCapture = Pick<
  Capture,
  | "id"
  | "workspaceId"
  | "type"
  | "content"
  | "status"
  | "organizationStatus"
  | "metadata"
  | "version"
  | "createdAt"
  | "contentUpdatedAt"
  | "archivedAt"
  | "restoredAt"
  | "updatedAt"
  | "deletedAt"
  | "createdByDeviceId"
  | "lastModifiedByDeviceId"
>;

export type KnowledgeBackupConcept = Concept & {
  normalizedLabel: string;
};

export type KnowledgeBackupCaptureConceptRelation = CaptureConceptRelation;

export type LegacyKnowledgeBackup = {
  format: typeof KNOWLEDGE_BACKUP_FORMAT;
  version: typeof KNOWLEDGE_BACKUP_VERSION;
  exportedAt: string;
  workspace: {
    id: string;
    name: string;
  };
  knowledge: {
    nodes: KnowledgeBackupCapture[];
    contexts: KnowledgeBackupConcept[];
    relations: KnowledgeBackupCaptureConceptRelation[];
  };
  summary: {
    nodes: number;
    contexts: number;
    relations: number;
  };
};

export type MemoryBackup = {
  format: typeof MEMORY_BACKUP_FORMAT;
  version: typeof MEMORY_BACKUP_VERSION;
  exportedAt: string;
  applicationVersion: string;
  memory: {
    captures: KnowledgeBackupCapture[];
    concepts: KnowledgeBackupConcept[];
    relations: KnowledgeBackupCaptureConceptRelation[];
  };
  summary: {
    captures: number;
    concepts: number;
    relations: number;
    archivedCaptures: number;
    archivedConcepts: number;
  };
  integrity: {
    algorithm: "vinema-json-stable-v1";
    checksum: string;
  };
  compatibility: {
    acceptsLegacyV1: true;
    restoredIntoCurrentAccount: true;
  };
  technical: {
    sourceWorkspaceId: string;
    sourceWorkspaceName: string;
  };
};

export type KnowledgeBackup = LegacyKnowledgeBackup | MemoryBackup;

export type CanonicalKnowledgeRepositories = {
  captureRepository: CaptureRepository;
  conceptRepository: ConceptRepository;
  captureConceptRelationRepository: CaptureConceptRelationRepository;
};

export type LegacyKnowledgeRepositories = {
  /** @deprecated Use captureRepository. Pending removal after terminology migration. */
  nodeRepository: CaptureRepository;
  /** @deprecated Use conceptRepository. Pending removal after terminology migration. */
  contextRepository: ConceptRepository;
  /** @deprecated Use captureConceptRelationRepository. Pending removal after terminology migration. */
  relationRepository: CaptureConceptRelationRepository;
};

export type KnowledgeRepositories =
  | CanonicalKnowledgeRepositories
  | LegacyKnowledgeRepositories;

type BuildKnowledgeBackupInput =
  | {
      workspace: Workspace;
      captures: Capture[];
      concepts: Concept[];
      relations: CaptureConceptRelation[];
      exportedAt: string;
    }
  | {
      workspace: Workspace;
      /** @deprecated Use captures. Pending removal after terminology migration. */
      nodes: Capture[];
      /** @deprecated Use concepts. Pending removal after terminology migration. */
      contexts: Concept[];
      relations: CaptureConceptRelation[];
      exportedAt: string;
    };

export type RestoreKnowledgeBackupResult = {
  createdNodes: number;
  createdContexts: number;
  createdRelations: number;
  skippedNodes: number;
  skippedContexts: number;
  skippedRelations: number;
};

export class KnowledgeBackupValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "KnowledgeBackupValidationError";
  }
}

export class KnowledgeRestoreConflictError extends Error {
  constructor(
    public readonly conflicts: string[],
    message = "El respaldo entra en conflicto con conocimiento existente.",
  ) {
    super(message);
    this.name = "KnowledgeRestoreConflictError";
  }
}

export async function exportKnowledgeBackup({
  workspace,
  repositories,
  now = () => new Date().toISOString(),
}: {
  workspace: Workspace;
  repositories: KnowledgeRepositories;
  now?: () => string;
}): Promise<MemoryBackup> {
  const repositoriesByConcept = normalizeKnowledgeRepositories(repositories);
  const [captures, concepts, relations] = await Promise.all([
    repositoriesByConcept.captureRepository.listByWorkspace(workspace.id, {
      includeArchived: true,
    }),
    repositoriesByConcept.conceptRepository.list({
      workspaceId: workspace.id,
      includeArchived: true,
    }),
    repositoriesByConcept.captureConceptRelationRepository.listByWorkspace(workspace.id),
  ]);

  return buildKnowledgeBackup({
    workspace,
    captures,
    concepts,
    relations,
    exportedAt: now(),
  });
}

export function buildKnowledgeBackup(input: BuildKnowledgeBackupInput): MemoryBackup {
  const { workspace, relations, exportedAt } = input;
  const captures = "captures" in input ? input.captures : input.nodes;
  const concepts = "concepts" in input ? input.concepts : input.contexts;
  const knowledgeCaptures = captures
    .filter(
      (capture) => capture.workspaceId === workspace.id && capture.deletedAt === null,
    )
    .map(toBackupCapture);
  const knowledgeConcepts = concepts
    .filter((concept) => concept.workspaceId === workspace.id)
    .map(toBackupConcept);
  const captureIds = new Set(knowledgeCaptures.map((capture) => capture.id));
  const conceptIds = new Set(knowledgeConcepts.map((concept) => concept.id));
  const knowledgeRelations = relations
    .filter((relation) => relation.workspaceId === workspace.id)
    .filter(
      (relation) =>
        captureIds.has(relation.nodeId) && conceptIds.has(relation.contextId),
    )
    .map(toBackupCaptureConceptRelation);

  const backup = withMemoryIntegrity({
    format: MEMORY_BACKUP_FORMAT,
    version: MEMORY_BACKUP_VERSION,
    exportedAt,
    applicationVersion: "0.1.0",
    memory: {
      captures: knowledgeCaptures,
      concepts: knowledgeConcepts,
      relations: knowledgeRelations,
    },
    summary: {
      captures: knowledgeCaptures.length,
      concepts: knowledgeConcepts.length,
      relations: knowledgeRelations.length,
      archivedCaptures: knowledgeCaptures.filter(
        (capture) => capture.status === "ARCHIVED",
      ).length,
      archivedConcepts: knowledgeConcepts.filter((concept) => concept.archivedAt)
        .length,
    },
    integrity: {
      algorithm: "vinema-json-stable-v1",
      checksum: "",
    },
    compatibility: {
      acceptsLegacyV1: true,
      restoredIntoCurrentAccount: true,
    },
    technical: {
      sourceWorkspaceId: workspace.id,
      sourceWorkspaceName: workspace.name,
    },
  });

  return validateMemoryBackup(backup);
}

export function serializeKnowledgeBackup(backup: KnowledgeBackup) {
  return `${JSON.stringify(validateKnowledgeBackup(backup), null, 2)}\n`;
}

export function createKnowledgeBackupFileName(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());

  return `vinema-memory-${year}-${month}-${day}-${hour}${minute}.json`;
}

export function parseKnowledgeBackupJson(
  text: string,
  options: { maxBytes?: number } = {},
) {
  const maxBytes = options.maxBytes ?? MAX_KNOWLEDGE_BACKUP_BYTES;
  if (new Blob([text]).size > maxBytes) {
    throw new KnowledgeBackupValidationError(
      "FILE_TOO_LARGE",
      "El respaldo supera el tamano maximo permitido.",
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new KnowledgeBackupValidationError(
      "INVALID_JSON",
      "El archivo no es un JSON valido.",
    );
  }

  return validateKnowledgeBackup(value);
}

export function validateKnowledgeBackup(value: unknown): KnowledgeBackup {
  const backup = asRecord(value, "El respaldo debe ser un objeto.");

  if (backup.format === MEMORY_BACKUP_FORMAT) {
    return validateMemoryBackup(backup);
  }

  return validateLegacyKnowledgeBackup(backup);
}

function validateLegacyKnowledgeBackup(value: unknown): LegacyKnowledgeBackup {
  const backup = asRecord(value, "El respaldo debe ser un objeto.");
  rejectSensitiveKeys(backup);

  if (backup.format !== KNOWLEDGE_BACKUP_FORMAT) {
    throw new KnowledgeBackupValidationError(
      "INVALID_FORMAT",
      "El formato del respaldo no es compatible con Vinema.",
    );
  }

  if (backup.version !== KNOWLEDGE_BACKUP_VERSION) {
    throw new KnowledgeBackupValidationError(
      "INVALID_VERSION",
      "La version del respaldo no es compatible.",
    );
  }

  const exportedAt = assertIsoDate(backup.exportedAt, "exportedAt");
  const workspace = asRecord(backup.workspace, "workspace debe ser un objeto.");
  const workspaceId = assertNonEmptyString(workspace.id, "workspace.id");
  const workspaceName = assertNonEmptyString(workspace.name, "workspace.name");
  const knowledge = asRecord(backup.knowledge, "knowledge debe ser un objeto.");
  const nodes = assertArray(knowledge.nodes, "knowledge.nodes").map(validateCapture);
  const contexts = assertArray(knowledge.contexts, "knowledge.contexts").map(
    validateConcept,
  );
  const relations = assertArray(knowledge.relations, "knowledge.relations").map(
    validateCaptureConceptRelation,
  );
  const summary = asRecord(backup.summary, "summary debe ser un objeto.");

  if (
    summary.nodes !== nodes.length ||
    summary.contexts !== contexts.length ||
    summary.relations !== relations.length
  ) {
    throw new KnowledgeBackupValidationError(
      "INVALID_SUMMARY",
      "Los conteos del respaldo no coinciden con su contenido.",
    );
  }

  const nodeIds = assertUnique(nodes.map((node) => node.id), "nodes.id");
  const contextIds = assertUnique(
    contexts.map((context) => context.id),
    "contexts.id",
  );
  assertUnique(relations.map((relation) => relation.id), "relations.id");

  for (const node of nodes) {
    if (node.workspaceId !== workspaceId) {
      throw new KnowledgeBackupValidationError(
        "MIXED_WORKSPACE",
        "El respaldo contiene capturas de otro workspace.",
      );
    }
  }

  for (const context of contexts) {
    if (context.workspaceId !== workspaceId) {
      throw new KnowledgeBackupValidationError(
        "MIXED_WORKSPACE",
        "El respaldo contiene conceptos de otro workspace.",
      );
    }

    const expectedKey = createConceptEquivalenceKey(context.name);
    if (context.normalizedLabel !== expectedKey) {
      throw new KnowledgeBackupValidationError(
        "INVALID_NORMALIZED_LABEL",
        "Un concepto no coincide con su etiqueta normalizada.",
      );
    }
  }

  for (const relation of relations) {
    if (relation.workspaceId !== workspaceId) {
      throw new KnowledgeBackupValidationError(
        "MIXED_WORKSPACE",
        "El respaldo contiene relaciones de otro workspace.",
      );
    }

    if (!nodeIds.has(relation.nodeId) || !contextIds.has(relation.contextId)) {
      throw new KnowledgeBackupValidationError(
        "ORPHAN_RELATION",
        "El respaldo contiene una relacion sin captura o concepto existente.",
      );
    }
  }

  rejectSensitiveKeys(backup);

  return {
    format: KNOWLEDGE_BACKUP_FORMAT,
    version: KNOWLEDGE_BACKUP_VERSION,
    exportedAt,
    workspace: {
      id: workspaceId,
      name: workspaceName,
    },
    knowledge: {
      nodes,
      contexts,
      relations,
    },
    summary: {
      nodes: nodes.length,
      contexts: contexts.length,
      relations: relations.length,
    },
  };
}

function validateMemoryBackup(value: unknown): MemoryBackup {
  const backup = asRecord(value, "El respaldo debe ser un objeto.");
  rejectSensitiveKeys(backup);

  if (backup.version !== MEMORY_BACKUP_VERSION) {
    throw new KnowledgeBackupValidationError(
      "INVALID_VERSION",
      "La version del respaldo no es compatible.",
    );
  }

  const exportedAt = assertIsoDate(backup.exportedAt, "exportedAt");
  const applicationVersion = assertNonEmptyString(
    backup.applicationVersion,
    "applicationVersion",
  );
  const memory = asRecord(backup.memory, "memory debe ser un objeto.");
  const captures = assertArray(memory.captures, "memory.captures").map(validateCapture);
  const concepts = assertArray(memory.concepts, "memory.concepts").map(
    validateConcept,
  );
  const relations = assertArray(memory.relations, "memory.relations").map(
    validateCaptureConceptRelation,
  );
  const summary = asRecord(backup.summary, "summary debe ser un objeto.");
  const integrity = asRecord(backup.integrity, "integrity debe ser un objeto.");
  const compatibility = asRecord(
    backup.compatibility,
    "compatibility debe ser un objeto.",
  );
  const technical = asRecord(backup.technical, "technical debe ser un objeto.");
  const sourceWorkspaceId = assertNonEmptyString(
    technical.sourceWorkspaceId,
    "technical.sourceWorkspaceId",
  );
  const sourceWorkspaceName = assertNonEmptyString(
    technical.sourceWorkspaceName,
    "technical.sourceWorkspaceName",
  );

  if (
    summary.captures !== captures.length ||
    summary.concepts !== concepts.length ||
    summary.relations !== relations.length
  ) {
    throw new KnowledgeBackupValidationError(
      "INVALID_SUMMARY",
      "Los conteos del respaldo no coinciden con su contenido.",
    );
  }

  const archivedCaptures = captures.filter((node) => node.status === "ARCHIVED")
    .length;
  const archivedConcepts = concepts.filter((context) => context.archivedAt).length;

  if (
    summary.archivedCaptures !== archivedCaptures ||
    summary.archivedConcepts !== archivedConcepts
  ) {
    throw new KnowledgeBackupValidationError(
      "INVALID_SUMMARY",
      "Los conteos archivados del respaldo no coinciden.",
    );
  }

  const nodeIds = assertUnique(captures.map((node) => node.id), "captures.id");
  const contextIds = assertUnique(
    concepts.map((context) => context.id),
    "concepts.id",
  );
  assertUnique(relations.map((relation) => relation.id), "relations.id");

  for (const node of captures) {
    if (node.workspaceId !== sourceWorkspaceId) {
      throw new KnowledgeBackupValidationError(
        "MIXED_WORKSPACE",
        "El respaldo contiene capturas de otra memoria tecnica.",
      );
    }
  }

  for (const context of concepts) {
    if (context.workspaceId !== sourceWorkspaceId) {
      throw new KnowledgeBackupValidationError(
        "MIXED_WORKSPACE",
        "El respaldo contiene conceptos de otra memoria tecnica.",
      );
    }

    const expectedKey = createConceptEquivalenceKey(context.name);
    if (context.normalizedLabel !== expectedKey) {
      throw new KnowledgeBackupValidationError(
        "INVALID_NORMALIZED_LABEL",
        "Un concepto no coincide con su etiqueta normalizada.",
      );
    }
  }

  for (const relation of relations) {
    if (relation.workspaceId !== sourceWorkspaceId) {
      throw new KnowledgeBackupValidationError(
        "MIXED_WORKSPACE",
        "El respaldo contiene relaciones de otra memoria tecnica.",
      );
    }

    if (!nodeIds.has(relation.nodeId) || !contextIds.has(relation.contextId)) {
      throw new KnowledgeBackupValidationError(
        "ORPHAN_RELATION",
        "El respaldo contiene una relacion sin captura o concepto existente.",
      );
    }
  }

  if (integrity.algorithm !== "vinema-json-stable-v1") {
    throw new KnowledgeBackupValidationError(
      "INVALID_INTEGRITY",
      "El algoritmo de integridad del respaldo no es compatible.",
    );
  }

  const checksum = assertNonEmptyString(integrity.checksum, "integrity.checksum");
  if (
    compatibility.acceptsLegacyV1 !== true ||
    compatibility.restoredIntoCurrentAccount !== true
  ) {
    throw new KnowledgeBackupValidationError(
      "INVALID_COMPATIBILITY",
      "La compatibilidad del respaldo no es valida.",
    );
  }

  const normalized: MemoryBackup = {
    format: MEMORY_BACKUP_FORMAT,
    version: MEMORY_BACKUP_VERSION,
    exportedAt,
    applicationVersion,
    memory: {
      captures,
      concepts,
      relations,
    },
    summary: {
      captures: captures.length,
      concepts: concepts.length,
      relations: relations.length,
      archivedCaptures,
      archivedConcepts,
    },
    integrity: {
      algorithm: "vinema-json-stable-v1",
      checksum,
    },
    compatibility: {
      acceptsLegacyV1: true,
      restoredIntoCurrentAccount: true,
    },
    technical: {
      sourceWorkspaceId,
      sourceWorkspaceName,
    },
  };

  rejectSensitiveKeys(normalized);

  if (checksum !== calculateMemoryBackupChecksum(normalized)) {
    throw new KnowledgeBackupValidationError(
      "INVALID_CHECKSUM",
      "La integridad del respaldo no coincide.",
    );
  }

  return normalized;
}

export async function restoreKnowledgeBackup({
  backup,
  workspace,
  deviceId,
  repositories,
  syncNow,
}: {
  backup: KnowledgeBackup;
  workspace: Workspace;
  deviceId: string;
  repositories: KnowledgeRepositories | LegacyKnowledgeRepositories;
  syncNow?: () => Promise<void>;
}): Promise<RestoreKnowledgeBackupResult> {
  const validBackup = toRestorableKnowledge(validateKnowledgeBackup(backup));

  if (validBackup.workspace.id !== workspace.id) {
    throw new KnowledgeBackupValidationError(
      "WORKSPACE_MISMATCH",
      "El respaldo pertenece a otro workspace.",
    );
  }

  const repositoriesByConcept = normalizeKnowledgeRepositories(repositories);
  const [existingCaptures, existingConcepts, existingRelations] = await Promise.all([
    repositoriesByConcept.captureRepository.listByWorkspace(workspace.id, {
      includeArchived: true,
    }),
    repositoriesByConcept.conceptRepository.list({
      workspaceId: workspace.id,
      includeArchived: true,
    }),
    repositoriesByConcept.captureConceptRelationRepository.listByWorkspace(workspace.id),
  ]);
  const conceptIdMap = new Map<string, string>();
  const conflicts: string[] = [];
  const existingCapturesById = new Map(
    existingCaptures.map((capture) => [capture.id, capture]),
  );
  const existingConceptsById = new Map(
    existingConcepts.map((concept) => [concept.id, concept]),
  );
  const existingConceptsByKey = new Map(
    existingConcepts.map((concept) => [
      createConceptEquivalenceKey(concept.name),
      concept,
    ]),
  );
  const existingRelationsById = new Map(
    existingRelations.map((relation) => [relation.id, relation]),
  );
  const existingRelationKeys = new Set(
    existingRelations.map((relation) =>
      relationKey(relation.nodeId, relation.contextId),
    ),
  );
  const conceptsToCreate: Concept[] = [];
  const capturesToCreate: Capture[] = [];
  const relationsToCreate: CaptureConceptRelation[] = [];
  let skippedConcepts = 0;
  let skippedCaptures = 0;
  let skippedRelations = 0;

  for (const concept of validBackup.knowledge.contexts) {
    const existingById = existingConceptsById.get(concept.id);
    if (existingById) {
      if (!sameConceptKnowledge(existingById, concept)) {
        conflicts.push(`concept:${concept.id}`);
      } else {
        skippedConcepts += 1;
      }
      conceptIdMap.set(concept.id, existingById.id);
      continue;
    }

    const existingByKey = existingConceptsByKey.get(concept.normalizedLabel);
    if (existingByKey) {
      conceptIdMap.set(concept.id, existingByKey.id);
      skippedConcepts += 1;
      continue;
    }

    const identityResolution = resolveConceptIdentity(concept.name, existingConcepts);
    if (identityResolution.status === "EXACT" || identityResolution.status === "ALIAS") {
      conceptIdMap.set(concept.id, identityResolution.conceptId);
      skippedConcepts += 1;
      continue;
    }

    if (identityResolution.status === "AMBIGUOUS") {
      conflicts.push(`concept:${concept.id}`);
      continue;
    }

    const aliasResolutions = (concept.aliases ?? []).map((alias) =>
      resolveConceptIdentity(alias, existingConcepts),
    );
    const aliasMatches = aliasResolutions.filter(
      (
        resolution,
      ): resolution is Extract<
        ReturnType<typeof resolveConceptIdentity>,
        { status: "EXACT" | "ALIAS" }
      > => resolution.status === "EXACT" || resolution.status === "ALIAS",
    );

    if (aliasResolutions.some((resolution) => resolution.status === "AMBIGUOUS")) {
      conflicts.push(`concept:${concept.id}`);
      continue;
    }

    const aliasConceptIds = new Set(aliasMatches.map((resolution) => resolution.conceptId));
    if (aliasConceptIds.size > 1) {
      conflicts.push(`concept:${concept.id}`);
      continue;
    }

    const [aliasMatch] = aliasMatches;
    if (aliasMatch) {
      conceptIdMap.set(concept.id, aliasMatch.conceptId);
      skippedConcepts += 1;
      continue;
    }

    conceptIdMap.set(concept.id, concept.id);
    conceptsToCreate.push(stripBackupConcept(concept));
  }

  for (const capture of validBackup.knowledge.nodes) {
    const existing = existingCapturesById.get(capture.id);
    if (existing) {
      if (!sameCaptureKnowledge(existing, capture)) {
        conflicts.push(`capture:${capture.id}`);
      } else {
        skippedCaptures += 1;
      }
      continue;
    }

    capturesToCreate.push({
      ...capture,
      workspaceId: workspace.id,
      createdByDeviceId: deviceId,
      lastModifiedByDeviceId: deviceId,
    });
  }

  for (const relation of validBackup.knowledge.relations) {
    const mappedConceptId = conceptIdMap.get(relation.contextId);
    if (!mappedConceptId) {
      throw new KnowledgeBackupValidationError(
        "ORPHAN_RELATION",
        "Una relacion apunta a un concepto inexistente.",
      );
    }

    const mappedRelation: CaptureConceptRelation = {
      ...relation,
      workspaceId: workspace.id,
      contextId: mappedConceptId,
    };
    const existingById = existingRelationsById.get(mappedRelation.id);
    if (existingById) {
      if (!sameRelationKnowledge(existingById, mappedRelation)) {
        conflicts.push(`relation:${mappedRelation.id}`);
      } else {
        skippedRelations += 1;
      }
      continue;
    }

    if (existingRelationKeys.has(relationKey(mappedRelation.nodeId, mappedConceptId))) {
      skippedRelations += 1;
      continue;
    }

    relationsToCreate.push(mappedRelation);
  }

  if (conflicts.length > 0) {
    throw new KnowledgeRestoreConflictError(conflicts);
  }

  for (const concept of conceptsToCreate) {
    await repositoriesByConcept.conceptRepository.save(concept);
  }

  for (const capture of capturesToCreate) {
    await repositoriesByConcept.captureRepository.create(capture);
  }

  for (const relation of relationsToCreate) {
    await repositoriesByConcept.captureConceptRelationRepository.save(relation);
  }

  if (
    conceptsToCreate.length > 0 ||
    capturesToCreate.length > 0 ||
    relationsToCreate.length > 0
  ) {
    await syncNow?.();
    dispatchKnowledgeRestored(workspace.id);
  }

  return {
    createdNodes: capturesToCreate.length,
    createdContexts: conceptsToCreate.length,
    createdRelations: relationsToCreate.length,
    skippedNodes: skippedCaptures,
    skippedContexts: skippedConcepts,
    skippedRelations,
  };
}

function toRestorableKnowledge(backup: KnowledgeBackup): LegacyKnowledgeBackup {
  if (backup.format === KNOWLEDGE_BACKUP_FORMAT) {
    return backup;
  }

  return {
    format: KNOWLEDGE_BACKUP_FORMAT,
    version: KNOWLEDGE_BACKUP_VERSION,
    exportedAt: backup.exportedAt,
    workspace: {
      id: backup.technical.sourceWorkspaceId,
      name: backup.technical.sourceWorkspaceName,
    },
    knowledge: {
      nodes: backup.memory.captures,
      contexts: backup.memory.concepts,
      relations: backup.memory.relations,
    },
    summary: {
      nodes: backup.summary.captures,
      contexts: backup.summary.concepts,
      relations: backup.summary.relations,
    },
  };
}

function toBackupCapture(capture: Capture): KnowledgeBackupCapture {
  return {
    id: capture.id,
    workspaceId: capture.workspaceId,
    type: capture.type,
    content: capture.content,
    status: capture.status,
    organizationStatus: capture.organizationStatus,
    metadata: sanitizeMetadata(capture.metadata),
    version: capture.version,
    createdAt: capture.createdAt,
    contentUpdatedAt: capture.contentUpdatedAt,
    archivedAt: capture.archivedAt ?? null,
    restoredAt: capture.restoredAt ?? null,
    updatedAt: capture.updatedAt,
    deletedAt: capture.deletedAt,
    createdByDeviceId: capture.createdByDeviceId,
    lastModifiedByDeviceId: capture.lastModifiedByDeviceId,
  };
}

function toBackupConcept(concept: Concept): KnowledgeBackupConcept {
  const normalizedConcept = normalizeContextAliases(concept);

  return {
    ...normalizedConcept,
    normalizedLabel: createConceptEquivalenceKey(concept.name),
  };
}

function toBackupCaptureConceptRelation(
  relation: CaptureConceptRelation,
): KnowledgeBackupCaptureConceptRelation {
  return { ...relation };
}

function validateCapture(value: unknown): KnowledgeBackupCapture {
  const capture = asRecord(value, "Cada captura debe ser un objeto.");
  const result: KnowledgeBackupCapture = {
    id: assertNonEmptyString(capture.id, "node.id"),
    workspaceId: assertNonEmptyString(capture.workspaceId, "node.workspaceId"),
    type: capture.type === "NOTE" || capture.type === "IDEA"
      ? capture.type
      : invalid("node.type"),
    content: assertString(capture.content, "node.content"),
    status: capture.status === "ACTIVE" || capture.status === "ARCHIVED"
      ? capture.status
      : invalid("node.status"),
    organizationStatus:
      capture.organizationStatus === "INBOX" ||
        capture.organizationStatus === "ORGANIZED"
        ? capture.organizationStatus
        : invalid("node.organizationStatus"),
    metadata: sanitizeMetadata(asOptionalRecord(capture.metadata) ?? {}),
    version: assertPositiveInteger(capture.version, "node.version"),
    createdAt: assertIsoDate(capture.createdAt, "node.createdAt"),
    contentUpdatedAt:
      capture.contentUpdatedAt === undefined
        ? undefined
        : assertIsoDate(capture.contentUpdatedAt, "node.contentUpdatedAt"),
    archivedAt:
      capture.archivedAt === null || capture.archivedAt === undefined
        ? null
        : assertIsoDate(capture.archivedAt, "node.archivedAt"),
    restoredAt:
      capture.restoredAt === null || capture.restoredAt === undefined
        ? null
        : assertIsoDate(capture.restoredAt, "node.restoredAt"),
    updatedAt: assertIsoDate(capture.updatedAt, "node.updatedAt"),
    deletedAt:
      capture.deletedAt === null || capture.deletedAt === undefined
        ? null
        : assertIsoDate(capture.deletedAt, "node.deletedAt"),
    createdByDeviceId: assertNonEmptyString(
      capture.createdByDeviceId,
      "node.createdByDeviceId",
    ),
    lastModifiedByDeviceId: assertNonEmptyString(
      capture.lastModifiedByDeviceId,
      "node.lastModifiedByDeviceId",
    ),
  };

  if (result.deletedAt !== null) {
    throw new KnowledgeBackupValidationError(
      "DELETED_NODE",
      "El respaldo no puede incluir capturas eliminadas.",
    );
  }

  return result;
}

function validateConcept(value: unknown): KnowledgeBackupConcept {
  const concept = asRecord(value, "Cada concepto debe ser un objeto.");
  const type = concept.type;
  const result = normalizeContextAliases({
    id: assertNonEmptyString(concept.id, "context.id"),
    workspaceId: assertNonEmptyString(concept.workspaceId, "context.workspaceId"),
    type: isConceptType(type) ? type : invalid("context.type"),
    name: assertNonEmptyString(concept.name, "context.name"),
    description:
      concept.description === null || concept.description === undefined
        ? null
        : assertString(concept.description, "context.description"),
    version: assertPositiveInteger(concept.version, "context.version"),
    createdAt: assertIsoDate(concept.createdAt, "context.createdAt"),
    updatedAt: assertIsoDate(concept.updatedAt, "context.updatedAt"),
    archivedAt:
      concept.archivedAt === null || concept.archivedAt === undefined
        ? null
        : assertIsoDate(concept.archivedAt, "context.archivedAt"),
    aliases: assertOptionalStringArray(concept.aliases, "context.aliases"),
    normalizedAliases: assertOptionalStringArray(
      concept.normalizedAliases,
      "context.normalizedAliases",
    ),
  });

  return {
    ...result,
    normalizedLabel: assertNonEmptyString(
      concept.normalizedLabel,
      "context.normalizedLabel",
    ),
  };
}

function validateCaptureConceptRelation(value: unknown): KnowledgeBackupCaptureConceptRelation {
  const relation = asRecord(value, "Cada relacion debe ser un objeto.");
  return {
    id: assertNonEmptyString(relation.id, "relation.id"),
    workspaceId: assertNonEmptyString(relation.workspaceId, "relation.workspaceId"),
    nodeId: assertNonEmptyString(relation.nodeId, "relation.nodeId"),
    contextId: assertNonEmptyString(relation.contextId, "relation.contextId"),
    relationType:
      relation.relationType === undefined ||
        relation.relationType === "CONTEXT" ||
        relation.relationType === "CAPTURE_ASSOCIATION"
        ? relation.relationType
        : invalid("relation.relationType"),
    relatedNodeId:
      relation.relatedNodeId === undefined
        ? undefined
        : assertNonEmptyString(relation.relatedNodeId, "relation.relatedNodeId"),
    version: assertPositiveInteger(relation.version, "relation.version"),
    createdAt: assertIsoDate(relation.createdAt, "relation.createdAt"),
  };
}

function stripBackupConcept(concept: KnowledgeBackupConcept): Concept {
  const { normalizedLabel, ...rest } = concept;
  void normalizedLabel;
  return normalizeContextAliases(rest);
}

function sameCaptureKnowledge(existing: Capture, backup: KnowledgeBackupCapture) {
  return (
    existing.content === backup.content &&
    existing.type === backup.type &&
    existing.status === backup.status &&
    existing.organizationStatus === backup.organizationStatus &&
    (existing.archivedAt ?? null) === (backup.archivedAt ?? null) &&
    (existing.restoredAt ?? null) === (backup.restoredAt ?? null)
  );
}

function sameConceptKnowledge(existing: Concept, backup: KnowledgeBackupConcept) {
  return (
    createConceptEquivalenceKey(existing.name) === backup.normalizedLabel &&
    existing.type === backup.type &&
    (existing.description ?? null) === (backup.description ?? null) &&
    haveSameAliases(existing.aliases ?? [], backup.aliases ?? []) &&
    haveSameAliases(
      existing.normalizedAliases ?? [],
      backup.normalizedAliases ?? [],
      normalizeConceptIdentityLabel,
    ) &&
    (existing.archivedAt ?? null) === (backup.archivedAt ?? null)
  );
}

function haveSameAliases(
  first: string[],
  second: string[],
  normalize: (value: string) => string = (value) => value.trim(),
) {
  const firstKeys = first.map(normalize).filter(Boolean).sort();
  const secondKeys = second.map(normalize).filter(Boolean).sort();

  return firstKeys.join("\u0001") === secondKeys.join("\u0001");
}

function sameRelationKnowledge(
  existing: CaptureConceptRelation,
  backup: CaptureConceptRelation,
) {
  return (
    existing.nodeId === backup.nodeId &&
    existing.contextId === backup.contextId &&
    existing.relationType === backup.relationType &&
    existing.relatedNodeId === backup.relatedNodeId
  );
}

function relationKey(nodeId: string, contextId: string) {
  return `${nodeId}:${contextId}`;
}

function normalizeKnowledgeRepositories(
  repositories: KnowledgeRepositories,
): CanonicalKnowledgeRepositories {
  if ("captureRepository" in repositories) {
    return repositories;
  }

  return {
    captureRepository: repositories.nodeRepository,
    conceptRepository: repositories.contextRepository,
    captureConceptRelationRepository: repositories.relationRepository,
  };
}

function sanitizeMetadata(metadata: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }
    if (isSerializableMetadata(value)) {
      result[key] = value;
    }
  }
  return result;
}

function withMemoryIntegrity(
  backup: Omit<MemoryBackup, "integrity"> & {
    integrity: MemoryBackup["integrity"];
  },
): MemoryBackup {
  return {
    ...backup,
    integrity: {
      algorithm: "vinema-json-stable-v1",
      checksum: calculateMemoryBackupChecksum(backup),
    },
  };
}

function calculateMemoryBackupChecksum(
  backup: Omit<MemoryBackup, "integrity"> & {
    integrity?: Partial<MemoryBackup["integrity"]>;
  },
) {
  const { integrity: _integrity, ...withoutIntegrity } = backup;
  void _integrity;
  let hash = 2_166_136_261;
  const text = stableStringify(withoutIntegrity);

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function isSerializableMetadata(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function rejectSensitiveKeys(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(rejectSensitiveKeys);
    return;
  }

  if (typeof value !== "object" || value === null) {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      throw new KnowledgeBackupValidationError(
        "SENSITIVE_FIELD",
        "El respaldo contiene campos sensibles.",
        { key },
      );
    }
    rejectSensitiveKeys(nested);
  }
}

function assertUnique(values: string[], label: string) {
  const result = new Set<string>();
  for (const value of values) {
    if (result.has(value)) {
      throw new KnowledgeBackupValidationError(
        "DUPLICATE_ID",
        `El respaldo contiene IDs duplicados en ${label}.`,
      );
    }
    result.add(value);
  }
  return result;
}

function asRecord(value: unknown, message: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KnowledgeBackupValidationError("INVALID_STRUCTURE", message);
  }

  return value as Record<string, unknown>;
}

function asOptionalRecord(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  return asRecord(value, "metadata debe ser un objeto.");
}

function assertArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new KnowledgeBackupValidationError(
      "INVALID_STRUCTURE",
      `${label} debe ser una lista.`,
    );
  }

  return value;
}

function assertOptionalStringArray(value: unknown, label: string) {
  if (value === undefined || value === null) {
    return [];
  }

  return assertArray(value, label).map((item, index) =>
    assertNonEmptyString(item, `${label}[${index}]`),
  );
}

function assertNonEmptyString(value: unknown, label: string) {
  const text = assertString(value, label);
  if (!text.trim()) {
    throw new KnowledgeBackupValidationError(
      "INVALID_VALUE",
      `${label} no puede estar vacio.`,
    );
  }

  return text;
}

function assertString(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new KnowledgeBackupValidationError(
      "INVALID_VALUE",
      `${label} debe ser texto.`,
    );
  }

  return value;
}

function assertIsoDate(value: unknown, label: string) {
  const text = assertNonEmptyString(value, label);
  if (Number.isNaN(Date.parse(text))) {
    throw new KnowledgeBackupValidationError(
      "INVALID_DATE",
      `${label} debe ser una fecha valida.`,
    );
  }

  return text;
}

function assertPositiveInteger(value: unknown, label: string) {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new KnowledgeBackupValidationError(
      "INVALID_VALUE",
      `${label} debe ser un entero positivo.`,
    );
  }

  return value as number;
}

function invalid(label: string): never {
  throw new KnowledgeBackupValidationError(
    "INVALID_VALUE",
    `${label} no es valido.`,
  );
}

function dispatchKnowledgeRestored(workspaceId: string) {
  emitSyncDataChanged({
    workspaceId,
    entityTypes: ["capture", "concept", "captureConcept"],
    changedAt: new Date().toISOString(),
  });
}

export function listContextTypesForBackup() {
  return CONTEXT_TYPES;
}

export function normalizeBackupContextLabel(label: string) {
  return normalizeConceptNameForComparison(label);
}
