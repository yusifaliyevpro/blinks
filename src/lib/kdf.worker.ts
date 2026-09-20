import { argon2id } from "hash-wasm";
import { ARGON2 } from "./kdf-params";

type Request = { kind: "warm" } | { kind: "derive"; password: string; salt: Uint8Array };
type Response = { ok: true; hash: Uint8Array } | { ok: false; error: string };

type WorkerScope = {
  addEventListener: (type: "message", listener: (event: MessageEvent<Request>) => void) => void;
  postMessage: (message: Response) => void;
};

// Worker globals aren't in the DOM lib this project compiles against.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const ctx = globalThis as unknown as WorkerScope;

ctx.addEventListener("message", (event) => {
  const request = event.data;

  // Throwaway hash at minimal cost: compiles the WASM so the real derivation doesn't.
  if (request.kind === "warm") {
    void argon2id({
      password: "warm",
      salt: new Uint8Array(8),
      parallelism: 1,
      iterations: 1,
      memorySize: 8,
      hashLength: 32,
      outputType: "binary",
    }).catch(() => {});
    return;
  }

  const { password, salt } = request;
  void argon2id({ password, salt, ...ARGON2, outputType: "binary" })
    .then((hash) => ctx.postMessage({ ok: true, hash }))
    .catch((error: unknown) => {
      ctx.postMessage({ ok: false, error: error instanceof Error ? error.message : "derivation failed" });
    });
});
