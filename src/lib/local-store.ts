"use client";

// Offline backend: the encrypted blob lives in this browser's IndexedDB instead
// of Redis. Same opaque `AES-GCM(gzip(JSON))` string, keyed by the HKDF `blobId`,
// with the same version CAS so two tabs can't clobber each other. No plaintext,
// no key material — only what the server would have stored (`c`, `v`, `t`).

import type { GetBlobResult, PutBlobInput, PutBlobResult } from "./types";

const DB_NAME = "blinks";
const STORE = "vault";

type StoredBlob = { c: string; v: number; t: string };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.addEventListener("upgradeneeded", () => req.result.createObjectStore(STORE));
    req.addEventListener("success", () => resolve(req.result));
    req.addEventListener("error", () => reject(req.error ?? new Error("IndexedDB open failed.")));
  });
  return dbPromise;
}

// In local mode the browser holds the only copy, so ask for persistent (non-
// evictable) storage. Best-effort: the store still works if the browser declines.
let persistenceRequested = false;
async function ensurePersistence(): Promise<void> {
  if (persistenceRequested) return;
  persistenceRequested = true;
  try {
    const storage = navigator.storage;
    if (storage?.persist && !(await storage.persisted())) await storage.persist();
  } catch {
    // ignore — persistence is an optimisation, not a requirement
  }
}

export async function localGetBlob(blobId: string): Promise<GetBlobResult> {
  void ensurePersistence();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(blobId);
    req.addEventListener("success", () => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- IDB results are `any`
      const stored = req.result as StoredBlob | undefined;
      resolve(stored?.c ? { ciphertext: stored.c, version: stored.v } : null);
    });
    req.addEventListener("error", () => reject(req.error ?? new Error("Local read failed.")));
  });
}

export async function localPutBlob(input: PutBlobInput): Promise<PutBlobResult> {
  void ensurePersistence();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(input.blobId);
    let result: PutBlobResult | null = null;
    let failure: Error | null = null;

    getReq.addEventListener("success", () => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- IDB results are `any`
      const cur = getReq.result as StoredBlob | undefined;
      const current = cur?.v ?? 0;

      // Parity with the Redis CAS: an existing blob is bound to the write token
      // from its first write. The same password derives the same token, so this
      // never trips in normal use — it just keeps both backends identical.
      if (cur?.t && cur.t !== input.writeToken) {
        failure = new Error("Not authorized to write this vault.");
        tx.abort();
        return;
      }
      if (current !== input.expectedVersion) {
        result = { conflict: true, current: cur ? { ciphertext: cur.c, version: cur.v } : null };
        return;
      }
      const next = current + 1;
      store.put({ c: input.ciphertext, v: next, t: input.writeToken } satisfies StoredBlob, input.blobId);
      result = { version: next };
    });

    tx.addEventListener("complete", () => resolve(result ?? { conflict: true, current: null }));
    tx.addEventListener("error", () => reject(failure ?? tx.error ?? new Error("Local write failed.")));
    tx.addEventListener("abort", () => reject(failure ?? tx.error ?? new Error("Local write aborted.")));
  });
}
