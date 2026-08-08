import {
  cloneStoredAuthSession,
  cloneStoredLocalAuthIdentity,
  parseStoredAuthSession,
  parseStoredLocalAuthIdentity,
  type AuthSessionStorage,
  type LocalAuthIdentityStorage,
  type StoredLocalAuthIdentity,
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

export class InMemoryLocalAuthIdentityStorage implements LocalAuthIdentityStorage {
  private identity: StoredLocalAuthIdentity | null = null;

  async load(): Promise<StoredLocalAuthIdentity | null> {
    return this.identity ? cloneStoredLocalAuthIdentity(this.identity) : null;
  }

  async save(identity: StoredLocalAuthIdentity): Promise<void> {
    const parsed = parseStoredLocalAuthIdentity(identity);
    if (!parsed) {
      throw new Error("Stored local auth identity is invalid.");
    }

    this.identity = cloneStoredLocalAuthIdentity(parsed);
  }

  snapshot(): StoredLocalAuthIdentity | null {
    return this.identity ? cloneStoredLocalAuthIdentity(this.identity) : null;
  }
}
