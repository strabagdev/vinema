import type { Device } from "@/domain/device/device";
import type { Context } from "@/domain/context/context";
import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";
import type { ContextRepository } from "@/domain/context/context-repository";
import type { NodeContextRelationRepository } from "@/domain/context/node-context-relation-repository";
import type { Workspace } from "@/domain/workspace/workspace";
import { clearCaptureDraft } from "@/features/capture/capture-draft";
import { notifyCaptureCreated } from "@/features/capture/capture-events";
import { captureText } from "@/features/capture/capture-text";
import { attachNodeToContext } from "@/features/context/node-context-relations";
import type { EmergingConceptSuggestion } from "@/features/associations/association-types";
import { createConceptEquivalenceKey } from "@/features/associations/concept-label-normalization";
import {
  normalizeContextAliases,
  resolveConceptIdentity,
} from "@/features/concepts/concept-identity";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";

export const CAPTURE_DRAFT_DEBOUNCE_MS = 500;

export class EmptyCaptureError extends Error {
  constructor() {
    super("Escribe algo antes de capturar.");
    this.name = "EmptyCaptureError";
  }
}

export type CommitCaptureInput = {
  content: string;
  workspace: Workspace;
  device: Device;
  repository: NodeRepository;
  contextRepository?: ContextRepository;
  relationRepository?: NodeContextRelationRepository;
  storage: StorageAdapter;
  selectedContextIds?: string[];
  selectedEmergingConcepts?: EmergingConceptSuggestion[];
};

export type CommitCaptureResult = {
  node: Node;
  relationError: boolean;
  failedRelationIds: string[];
};

export async function commitCaptureText({
  content,
  workspace,
  device,
  repository,
  contextRepository,
  relationRepository,
  storage,
  selectedContextIds = [],
  selectedEmergingConcepts = [],
}: CommitCaptureInput): Promise<CommitCaptureResult> {
  if (!content.trim()) {
    throw new EmptyCaptureError();
  }

  const node = await captureText(repository, {
    content,
    workspace,
    device,
  });
  const failedRelationIds: string[] = [];

  if (
    contextRepository &&
    relationRepository &&
    (selectedContextIds.length > 0 || selectedEmergingConcepts.length > 0)
  ) {
    const contextIds = new Set(selectedContextIds);

    for (const emergingConcept of selectedEmergingConcepts) {
      try {
        const context = await getOrCreateEmergingConceptContext(
          contextRepository,
          workspace.id,
          emergingConcept,
        );
        contextIds.add(context.id);

        for (const evidenceCaptureId of emergingConcept.evidenceCaptureIds) {
          await attachNodeToContext(
            {
              contextRepository,
              nodeContextRelationRepository: relationRepository,
              nodeRepository: repository,
            },
            { nodeId: evidenceCaptureId, contextId: context.id },
          );
        }
      } catch {
        failedRelationIds.push(emergingConcept.candidateId);
      }
    }

    for (const contextId of Array.from(contextIds)) {
      try {
        await attachNodeToContext(
          {
            contextRepository,
            nodeContextRelationRepository: relationRepository,
            nodeRepository: repository,
          },
          { nodeId: node.id, contextId },
        );
      } catch {
        failedRelationIds.push(contextId);
      }
    }
  }

  await clearCaptureDraft(storage);
  notifyCaptureCreated();
  return {
    node,
    relationError: failedRelationIds.length > 0,
    failedRelationIds,
  };
}

async function getOrCreateEmergingConceptContext(
  repository: ContextRepository,
  workspaceId: string,
  emergingConcept: EmergingConceptSuggestion,
): Promise<Context> {
  const contexts = await repository.list({
    workspaceId,
  });
  const normalizedLabel = createConceptEquivalenceKey(emergingConcept.suggestedLabel);
  const resolution = resolveConceptIdentity(emergingConcept.suggestedLabel, contexts);

  if (resolution.status === "EXACT" || resolution.status === "ALIAS") {
    return resolution.concept;
  }

  if (resolution.status === "AMBIGUOUS") {
    throw new Error("El concepto emergente coincide con mas de una identidad.");
  }

  const existingContext = contexts.find(
    (context) => createConceptEquivalenceKey(context.name) === normalizedLabel,
  );

  if (existingContext) {
    return existingContext;
  }

  const now = new Date().toISOString();
  const context: Context = normalizeContextAliases({
    id: crypto.randomUUID(),
    workspaceId,
    type: "AREA",
    name: emergingConcept.suggestedLabel,
    description:
      emergingConcept.evidenceCaptureIds.length > 0
        ? `Concepto emergente confirmado desde ${emergingConcept.evidenceCaptureIds.length} capturas.`
        : "Concepto emergente confirmado desde la captura actual.",
    version: 1,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  });

  return repository.save(context);
}
