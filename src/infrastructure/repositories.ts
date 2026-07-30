import { IndexedDbContextRepository } from "@/infrastructure/context/indexed-db-context-repository";
import { IndexedDbNodeContextRelationRepository } from "@/infrastructure/context/indexed-db-node-context-relation-repository";
import { IndexedDbNodeRepository } from "@/infrastructure/node/indexed-db-node-repository";
import { IndexedDbAdapter } from "@/infrastructure/storage/indexed-db-adapter";
import { createLocalSyncRepositories } from "@/infrastructure/sync/indexed-db-local-sync-repositories";
import { IndexedDbWorkspaceRepository } from "@/infrastructure/workspace/indexed-db-workspace-repository";

export const storageAdapter = new IndexedDbAdapter();
export const contextRepository = new IndexedDbContextRepository();
export const nodeRepository = new IndexedDbNodeRepository();
export const nodeContextRelationRepository =
  new IndexedDbNodeContextRelationRepository();
export const workspaceRepository = new IndexedDbWorkspaceRepository();

export function createLocalSyncRepositorySet(input: {
  workspaceId: string;
  deviceId: string;
}) {
  return createLocalSyncRepositories({
    syncContext: input,
    origin: "LOCAL",
  });
}
