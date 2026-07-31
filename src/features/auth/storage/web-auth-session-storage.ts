import { IndexedDbAuthSessionStorage } from "@/features/auth/storage/indexed-db-auth-session-storage";
import type { AuthSessionStorage } from "@/features/auth/storage/auth-session-storage";

export function createWebAuthSessionStorage(): AuthSessionStorage {
  return new IndexedDbAuthSessionStorage();
}
