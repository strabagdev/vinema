import type { Context } from "@/domain/context/context";
import type { ContextRepository } from "@/domain/context/context-repository";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { NodeContextRelationRepository } from "@/domain/context/node-context-relation-repository";
import {
  deriveCaptureEmergentIdentity,
  type CaptureEmergentIdentity,
} from "@/features/identity/capture-emergent-identity";

export type CaptureIdentityRepositories = {
  contextRepository: ContextRepository;
  nodeContextRelationRepository: NodeContextRelationRepository;
};

export async function loadCaptureEmergentIdentity(
  repositories: CaptureIdentityRepositories,
  nodeId: string,
): Promise<CaptureEmergentIdentity> {
  const relations =
    await repositories.nodeContextRelationRepository.listByNodeId(nodeId);
  const contexts = await loadContextsForRelations(
    repositories.contextRepository,
    relations,
  );

  return deriveCaptureEmergentIdentity({
    contexts,
    relations,
    nodeId,
  });
}

export async function loadCaptureEmergentIdentities(
  repositories: CaptureIdentityRepositories,
  nodeIds: string[],
): Promise<Map<string, CaptureEmergentIdentity>> {
  const uniqueNodeIds = Array.from(new Set(nodeIds));
  const identities = await Promise.all(
    uniqueNodeIds.map(async (nodeId) => [
      nodeId,
      await loadCaptureEmergentIdentity(repositories, nodeId),
    ] as const),
  );

  return new Map(identities);
}

async function loadContextsForRelations(
  contextRepository: ContextRepository,
  relations: NodeContextRelation[],
): Promise<Context[]> {
  const uniqueContextIds = Array.from(
    new Set(relations.map((relation) => relation.contextId)),
  );
  const contexts = await Promise.all(
    uniqueContextIds.map((contextId) => contextRepository.getById(contextId)),
  );

  return contexts.filter((context): context is Context => context !== null);
}
