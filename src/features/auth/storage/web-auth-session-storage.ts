import {
  IndexedDbAuthSessionStorage,
  IndexedDbLocalAuthIdentityStorage,
} from "@/features/auth/storage/indexed-db-auth-session-storage";
import type {
  AuthSessionStorage,
  LocalAuthIdentityStorage,
} from "@/features/auth/storage/auth-session-storage";

export function createWebAuthSessionStorage(): AuthSessionStorage {
  return new IndexedDbAuthSessionStorage();
}

export function createWebLocalAuthIdentityStorage(): LocalAuthIdentityStorage {
  return new IndexedDbLocalAuthIdentityStorage();
}
