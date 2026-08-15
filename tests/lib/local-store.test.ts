import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as LocalStore from "@/lib/local-store";
import type { PutBlobInput } from "@/lib/types";

// The local backend talks to real IndexedDB. Node has none, so install
// fake-indexeddb's real implementation and give each test a clean factory. The
// module caches its DB connection, so re-import it fresh after resetting.
let localGetBlob: typeof LocalStore.localGetBlob;
let localPutBlob: typeof LocalStore.localPutBlob;

const ID = "a".repeat(64);
const TOKEN = "c".repeat(64);

function input(over: Partial<PutBlobInput> = {}): PutBlobInput {
  return { blobId: ID, ciphertext: "cipher-1", expectedVersion: 0, writeToken: TOKEN, ...over };
}

beforeEach(async () => {
  Object.defineProperty(globalThis, "indexedDB", {
    value: new IDBFactory(),
    writable: true,
    configurable: true,
  });
  vi.resetModules();
  ({ localGetBlob, localPutBlob } = await import("@/lib/local-store"));
});

describe("localGetBlob", () => {
  it("returns null when nothing is stored", async () => {
    expect(await localGetBlob(ID)).toBeNull();
  });

  it("returns the stored ciphertext and version after a write", async () => {
    await localPutBlob(input({ ciphertext: "stored" }));
    expect(await localGetBlob(ID)).toEqual({ ciphertext: "stored", version: 1 });
  });

  it("isolates blobs by id", async () => {
    await localPutBlob(input({ blobId: "a".repeat(64), ciphertext: "one" }));
    await localPutBlob(input({ blobId: "b".repeat(64), ciphertext: "two" }));
    expect(await localGetBlob("a".repeat(64))).toEqual({ ciphertext: "one", version: 1 });
    expect(await localGetBlob("b".repeat(64))).toEqual({ ciphertext: "two", version: 1 });
  });
});

describe("localPutBlob — version CAS", () => {
  it("creates a new blob at version 1 from expectedVersion 0", async () => {
    expect(await localPutBlob(input())).toEqual({ version: 1 });
  });

  it("increments the version on a matched compare-and-set", async () => {
    await localPutBlob(input({ expectedVersion: 0 }));
    expect(await localPutBlob(input({ ciphertext: "cipher-2", expectedVersion: 1 }))).toEqual({ version: 2 });
    expect(await localGetBlob(ID)).toEqual({ ciphertext: "cipher-2", version: 2 });
  });

  it("rejects a stale write as a conflict, returning the current blob", async () => {
    await localPutBlob(input({ ciphertext: "winner", expectedVersion: 0 }));

    const res = await localPutBlob(input({ ciphertext: "loser", expectedVersion: 0 }));

    expect(res).toEqual({ conflict: true, current: { ciphertext: "winner", version: 1 } });
    // The losing write must not have overwritten anything.
    expect(await localGetBlob(ID)).toEqual({ ciphertext: "winner", version: 1 });
  });

  it("reports a null current when a non-zero version is expected but no blob exists", async () => {
    expect(await localPutBlob(input({ expectedVersion: 3 }))).toEqual({ conflict: true, current: null });
  });
});

describe("localPutBlob — write-token parity", () => {
  it("binds an existing blob to the first write's token and rejects a mismatch", async () => {
    await localPutBlob(input({ writeToken: "c".repeat(64) }));

    await expect(localPutBlob(input({ expectedVersion: 1, writeToken: "d".repeat(64) }))).rejects.toThrow(
      /not authorized/i,
    );
    // The rejected write left the vault untouched.
    expect(await localGetBlob(ID)).toEqual({ ciphertext: "cipher-1", version: 1 });
  });

  it("checks the token before the version (wrong token loses even with a fresh version)", async () => {
    await localPutBlob(input({ writeToken: "c".repeat(64) }));
    // Correct expectedVersion, wrong token — still unauthorized, not a conflict.
    await expect(localPutBlob(input({ expectedVersion: 1, writeToken: "e".repeat(64) }))).rejects.toThrow(
      /not authorized/i,
    );
  });

  it("lets the matching token keep writing", async () => {
    await localPutBlob(input({ expectedVersion: 0, writeToken: TOKEN }));
    expect(await localPutBlob(input({ ciphertext: "again", expectedVersion: 1, writeToken: TOKEN }))).toEqual({
      version: 2,
    });
  });
});
