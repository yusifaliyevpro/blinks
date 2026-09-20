import { ARGON2 } from "./kdf-params";

type Response = { ok: true; hash: Uint8Array } | { ok: false; error: string };

// Spawned ahead of the unlock by warmKdf, then consumed (and terminated) by the
// derivation: holding it would pin the 128 MiB the hash allocates.
let warmed: Worker | null = null;

function spawn(): Worker {
  return new Worker(new URL("./kdf.worker.ts", import.meta.url), { type: "module" });
}

// Fetching the worker chunk and compiling the WASM costs more than the hash
// itself, so pay it while the user is still typing.
export function warmKdf(): void {
  if (typeof Worker === "undefined" || warmed) return;
  try {
    warmed = spawn();
    warmed.postMessage({ kind: "warm" });
  } catch {
    warmed = null;
  }
}

// Dynamic import so hash-wasm only lands in the main bundle when this path runs.
async function deriveInline(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const { argon2id } = await import("hash-wasm");
  return argon2id({ password, salt, ...ARGON2, outputType: "binary" });
}

function deriveInWorker(password: string, salt: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = warmed ?? spawn();
    warmed = null;

    worker.addEventListener("message", (event: MessageEvent<Response>) => {
      const data = event.data;
      worker.terminate();
      if (data.ok) resolve(data.hash);
      else reject(new Error(data.error));
    });

    worker.addEventListener("error", () => {
      worker.terminate();
      reject(new Error("kdf worker failed"));
    });

    worker.postMessage({ kind: "derive", password, salt });
  });
}

// One Argon2id pass, off the main thread where possible: at these parameters it
// takes hundreds of ms and would otherwise freeze the tab.
export async function deriveMaster(password: string, salt: Uint8Array): Promise<Uint8Array> {
  if (typeof Worker === "undefined") return deriveInline(password, salt);
  try {
    return await deriveInWorker(password, salt);
  } catch {
    return deriveInline(password, salt);
  }
}
