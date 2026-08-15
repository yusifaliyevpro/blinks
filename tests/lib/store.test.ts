import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetBlobResult, PutBlobInput, PutBlobResult } from "@/lib/types";

type GetFn = (id: string) => Promise<GetBlobResult>;
type PutFn = (input: PutBlobInput) => Promise<PutBlobResult>;

// Both backends are mocked so the router's only job — dispatch by backend — is
// what's under test, in isolation from Redis and IndexedDB.
const getBlobRemote = vi.hoisted(() => vi.fn<GetFn>());
const putBlobRemote = vi.hoisted(() => vi.fn<PutFn>());
const localGetBlob = vi.hoisted(() => vi.fn<GetFn>());
const localPutBlob = vi.hoisted(() => vi.fn<PutFn>());

vi.mock("@/lib/actions", () => ({ getBlob: getBlobRemote, putBlob: putBlobRemote }));
vi.mock("@/lib/local-store", () => ({ localGetBlob, localPutBlob }));

const { getBlob, putBlob } = await import("@/lib/store");

const ID = "a".repeat(64);
const INPUT: PutBlobInput = { blobId: ID, ciphertext: "cipher", expectedVersion: 2, writeToken: "c".repeat(64) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getBlob routing", () => {
  it("uses the remote action for the redis backend", async () => {
    getBlobRemote.mockResolvedValue({ ciphertext: "ct", version: 5 });

    expect(await getBlob("redis", ID)).toEqual({ ciphertext: "ct", version: 5 });
    expect(getBlobRemote).toHaveBeenCalledWith(ID);
    expect(localGetBlob).not.toHaveBeenCalled();
  });

  it("uses IndexedDB for the local backend", async () => {
    localGetBlob.mockResolvedValue({ ciphertext: "local-ct", version: 1 });

    expect(await getBlob("local", ID)).toEqual({ ciphertext: "local-ct", version: 1 });
    expect(localGetBlob).toHaveBeenCalledWith(ID);
    expect(getBlobRemote).not.toHaveBeenCalled();
  });
});

describe("putBlob routing", () => {
  it("uses the remote action for the redis backend", async () => {
    putBlobRemote.mockResolvedValue({ version: 3 });

    expect(await putBlob("redis", INPUT)).toEqual({ version: 3 });
    expect(putBlobRemote).toHaveBeenCalledWith(INPUT);
    expect(localPutBlob).not.toHaveBeenCalled();
  });

  it("uses IndexedDB for the local backend", async () => {
    localPutBlob.mockResolvedValue({ version: 4 });

    expect(await putBlob("local", INPUT)).toEqual({ version: 4 });
    expect(localPutBlob).toHaveBeenCalledWith(INPUT);
    expect(putBlobRemote).not.toHaveBeenCalled();
  });
});
