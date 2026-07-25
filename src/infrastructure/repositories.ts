import { IndexedDbNodeRepository } from "@/infrastructure/node/indexed-db-node-repository";
import { IndexedDbAdapter } from "@/infrastructure/storage/indexed-db-adapter";
import { IndexedDbWorkspaceRepository } from "@/infrastructure/workspace/indexed-db-workspace-repository";

export const storageAdapter = new IndexedDbAdapter();
export const nodeRepository = new IndexedDbNodeRepository();
export const workspaceRepository = new IndexedDbWorkspaceRepository();
