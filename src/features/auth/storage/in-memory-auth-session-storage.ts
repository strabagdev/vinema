import {
  cloneStoredAuthSession,
  parseStoredAuthSession,
  type AuthSessionStorage,
  type StoredAuthSession,
} from "@/features/auth/storage/auth-session-storage";

export class InMemoryAuthSessionStorage implements AuthSessionStorage {
  private session: StoredAuthSession | null = null;

  async load(): Promise<StoredAuthSession | null> {
    return this.session ? cloneStoredAuthSession(this.session) : null;
  }

  async save(session: StoredAuthSession): Promise<void> {
    const parsed = parseStoredAuthSession(session);
    if (!parsed) {
      throw new Error("Stored auth session is invalid.");
    }

    this.session = cloneStoredAuthSession(parsed);
  }

  async clear(): Promise<void> {
    this.session = null;
  }

  snapshot(): StoredAuthSession | null {
    return this.session ? cloneStoredAuthSession(this.session) : null;
  }
}
