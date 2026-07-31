import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteDB } from "idb";
import {
  AUTH_SESSION_STORE,
  VINEMA_DB_NAME,
  getVinemaDb,
  resetVinemaDbConnectionForTests,
} from "@/infrastructure/storage/vinema-db";
import {
  CURRENT_AUTH_SESSION_KEY,
  IndexedDbAuthSessionStorage,
} from "@/features/auth/storage/indexed-db-auth-session-storage";
import { InMemoryAuthSessionStorage } from "@/features/auth/storage/in-memory-auth-session-storage";
import {
  AuthSessionStorageError,
  parseStoredAuthSession,
  type StoredAuthSession,
} from "@/features/auth/storage/auth-session-storage";

const session: StoredAuthSession = {
  refreshToken: "refresh-token",
  sessionId: "session-id",
  deviceId: "device-id",
  storedAt: "2026-07-31T10:00:00.000Z",
};

describe("auth session storage", () => {
  beforeEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  afterEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  it("IndexedDbAuthSessionStorage saves, loads and overwrites the current session", async () => {
    const storage = new IndexedDbAuthSessionStorage();
    await expect(storage.load()).resolves.toBeNull();

    await storage.save(session);
    await expect(storage.load()).resolves.toEqual(session);

    await storage.save({
      ...session,
      refreshToken: "refresh-token-2",
      sessionId: "session-id-2",
      storedAt: "2026-07-31T10:01:00.000Z",
    });

    await expect(storage.load()).resolves.toEqual({
      refreshToken: "refresh-token-2",
      sessionId: "session-id-2",
      deviceId: "device-id",
      storedAt: "2026-07-31T10:01:00.000Z",
    });

    const db = await getVinemaDb();
    const all = await db.getAll(AUTH_SESSION_STORE);
    expect(all).toHaveLength(1);
    expect(JSON.stringify(all[0])).not.toContain("access-token");
  });

  it("IndexedDbAuthSessionStorage clears idempotently", async () => {
    const storage = new IndexedDbAuthSessionStorage();
    await storage.save(session);

    await storage.clear();
    await storage.clear();

    await expect(storage.load()).resolves.toBeNull();
  });

  it("IndexedDbAuthSessionStorage removes corrupt stored data and returns null", async () => {
    const db = await getVinemaDb();
    await db.put(
      AUTH_SESSION_STORE,
      { refreshToken: "", sessionId: "session-id", deviceId: "device-id", storedAt: session.storedAt },
      CURRENT_AUTH_SESSION_KEY,
    );

    const storage = new IndexedDbAuthSessionStorage();
    await expect(storage.load()).resolves.toBeNull();
    await expect(db.get(AUTH_SESSION_STORE, CURRENT_AUTH_SESSION_KEY)).resolves.toBeUndefined();
  });

  it("validates corrupt StoredAuthSession shapes", () => {
    expect(parseStoredAuthSession({ ...session, refreshToken: "" })).toBeNull();
    expect(parseStoredAuthSession({ ...session, sessionId: "" })).toBeNull();
    expect(parseStoredAuthSession({ ...session, deviceId: "" })).toBeNull();
    expect(parseStoredAuthSession({ ...session, storedAt: "not-a-date" })).toBeNull();
    expect(parseStoredAuthSession({ ...session, accessToken: "access-token" })).toEqual(session);
  });

  it("InMemoryAuthSessionStorage clones values and validates saved sessions", async () => {
    const storage = new InMemoryAuthSessionStorage();
    const mutable = { ...session };

    await storage.save(mutable);
    mutable.refreshToken = "mutated";
    const loaded = await storage.load();
    expect(loaded).toEqual(session);

    if (!loaded) {
      throw new Error("Expected stored session.");
    }
    loaded.refreshToken = "changed-after-load";
    expect(await storage.load()).toEqual(session);

    await expect(
      storage.save({ ...session, refreshToken: "" }),
    ).rejects.toThrow("Stored auth session is invalid.");
  });

  it("IndexedDbAuthSessionStorage wraps IndexedDB write errors", async () => {
    const storage = new IndexedDbAuthSessionStorage();
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
    const db = await getVinemaDb();
    db.close();

    await expect(storage.save(session)).rejects.toBeInstanceOf(AuthSessionStorageError);
  });

  it("service worker does not cache authentication requests", () => {
    const source = readFileSync("public/sw.js", "utf8");

    expect(source).toContain("requestUrl.origin !== self.location.origin");
    expect(source).toContain('requestUrl.pathname.startsWith("/auth")');
    expect(source).toContain('requestUrl.pathname.startsWith("/api")');
    expect(source).not.toContain("refreshToken");
    expect(source).not.toContain("accessToken");
  });
});
