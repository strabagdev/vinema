import { describe, expect, it } from "vitest";
import { LocalStorageAdapter } from "@/infrastructure/storage/local-storage-adapter";

describe("StorageAdapter", () => {
  it("stores, retrieves and removes JSON values", async () => {
    const adapter = new LocalStorageAdapter(window.localStorage);
    const key = "vinema:test";

    await adapter.set(key, { title: "Memoria viva" });

    await expect(adapter.get(key)).resolves.toEqual({ title: "Memoria viva" });

    await adapter.remove(key);

    await expect(adapter.get(key)).resolves.toBeNull();
  });
});
