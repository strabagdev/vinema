import {
  AuthSessionStorageError,
  cloneStoredAuthSession,
  parseStoredAuthSession,
  type AuthSessionStorage,
  type StoredAuthSession,
} from "@/features/auth/storage/auth-session-storage";
import {
  AUTH_SESSION_STORE,
  getVinemaDb,
} from "@/infrastructure/storage/vinema-db";

export const CURRENT_AUTH_SESSION_KEY = "current";

export class IndexedDbAuthSessionStorage implements AuthSessionStorage {
  async load(): Promise<StoredAuthSession | null> {
    try {
      const db = await getVinemaDb();
      const value = await db.get(AUTH_SESSION_STORE, CURRENT_AUTH_SESSION_KEY);
      const parsed = parseStoredAuthSession(value);

      if (!parsed && value !== undefined) {
        await db.delete(AUTH_SESSION_STORE, CURRENT_AUTH_SESSION_KEY);
      }

      return parsed ? cloneStoredAuthSession(parsed) : null;
    } catch (error) {
      throw new AuthSessionStorageError("No se pudo leer la sesion local.", error);
    }
  }

  async save(session: StoredAuthSession): Promise<void> {
    const parsed = parseStoredAuthSession(session);
    if (!parsed) {
      throw new AuthSessionStorageError("La sesion local no es valida.");
    }

    try {
      const db = await getVinemaDb();
      await db.put(
        AUTH_SESSION_STORE,
        cloneStoredAuthSession(parsed),
        CURRENT_AUTH_SESSION_KEY,
      );
    } catch (error) {
      throw new AuthSessionStorageError("No se pudo guardar la sesion local.", error);
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await getVinemaDb();
      await db.delete(AUTH_SESSION_STORE, CURRENT_AUTH_SESSION_KEY);
    } catch (error) {
      throw new AuthSessionStorageError("No se pudo limpiar la sesion local.", error);
    }
  }
}
