import { IndexedDbContextRepository } from "@/infrastructure/context/indexed-db-context-repository";
import { IndexedDbNodeContextRelationRepository } from "@/infrastructure/context/indexed-db-node-context-relation-repository";
import { IndexedDbNodeRepository } from "@/infrastructure/node/indexed-db-node-repository";
import { IndexedDbAdapter } from "@/infrastructure/storage/indexed-db-adapter";
import { createLocalSyncRepositories } from "@/infrastructure/sync/indexed-db-local-sync-repositories";
import { IndexedDbWorkspaceRepository } from "@/infrastructure/workspace/indexed-db-workspace-repository";

export const storageAdapter = new IndexedDbAdapter();
export const conceptRepository = new IndexedDbContextRepository();
export const captureRepository = new IndexedDbNodeRepository();
export const captureConceptRelationRepository =
  new IndexedDbNodeContextRelationRepository();
export const workspaceRepository = new IndexedDbWorkspaceRepository();

/** @deprecated Use conceptRepository. Pending removal after terminology migration. */
export const contextRepository = conceptRepository;

/** @deprecated Use captureRepository. Pending removal after terminology migration. */
export const nodeRepository = captureRepository;

/** @deprecated Use captureConceptRelationRepository. Pending removal after terminology migration. */
export const nodeContextRelationRepository = captureConceptRelationRepository;

export function createLocalSyncRepositorySet(input: {
  workspaceId: string;
  deviceId: string;
}) {
  const repositories = createLocalSyncRepositories({
    syncContext: input,
    origin: "LOCAL",
  });

  return {
    ...repositories,
    captureRepository: repositories.nodeRepository,
    conceptRepository: repositories.contextRepository,
    captureConceptRelationRepository:
      repositories.nodeContextRelationRepository,
  };
}
