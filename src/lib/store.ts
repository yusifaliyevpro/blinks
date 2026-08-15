// Storage router: picks the blob backend at call time. Both paths satisfy the
// same contract (version CAS + write-token), so the commit loop is agnostic to
// where the vault actually lives.

import { getBlob as getBlobRemote, putBlob as putBlobRemote } from "./actions";
import { localGetBlob, localPutBlob } from "./local-store";
import type { GetBlobResult, PutBlobInput, PutBlobResult, StorageBackend } from "./types";

export function getBlob(backend: StorageBackend, blobId: string): Promise<GetBlobResult> {
  return backend === "local" ? localGetBlob(blobId) : getBlobRemote(blobId);
}

export function putBlob(backend: StorageBackend, input: PutBlobInput): Promise<PutBlobResult> {
  return backend === "local" ? localPutBlob(input) : putBlobRemote(input);
}
