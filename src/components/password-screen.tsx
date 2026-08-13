"use client";

import { useState } from "react";
import { FiCheck, FiEye, FiEyeOff, FiRefreshCw } from "react-icons/fi";
import { getBlob } from "@/lib/actions";
import { decryptJSON, deriveVault, generatePassword, saveSession, type Session } from "@/lib/crypto";
import type { LinkItem } from "@/lib/types";

export type Unlocked = {
  session: Session;
  links: LinkItem[];
  version: number;
};

export function PasswordScreen({ onUnlock }: { onUnlock: (u: Unlocked) => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setShake(false);

    try {
      const vault = await deriveVault(password);
      const blob = await getBlob(vault.blobId);

      let links: LinkItem[] = [];
      let version = 0;
      if (blob) {
        // Throws on a wrong password (AES-GCM auth failure).
        links = await decryptJSON<LinkItem[]>(vault.key, blob.ciphertext);
        version = blob.version;
      }

      saveSession(vault.blobId, vault.encKeyBytes);
      onUnlock({
        session: { blobId: vault.blobId, key: vault.key },
        links,
        version,
      });
    } catch {
      setPassword("");
      setBusy(false);
      setShake(true);
    }
  }

  function generate() {
    if (busy) return;
    const pw = generatePassword(200);
    setPassword(pw);
    setShake(false);
    // Copy so it can be saved to a password manager — it's the only key.
    if (navigator.clipboard) {
      void navigator.clipboard
        .writeText(pw)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
        .catch(() => {});
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form onSubmit={submit} className="relative w-full max-w-sm">
        <h1 className="absolute inset-x-0 bottom-full mb-6 text-center font-display text-6xl leading-none tracking-tight text-text select-none">
          Blinks
        </h1>

        <div className="relative">
          <input
            type={show ? "text" : "password"}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            value={password}
            placeholder="Password"
            // Discourage password managers from touching this field.
            data-1p-ignore
            data-lpignore="true"
            data-bwignore="true"
            data-form-type="other"
            onChange={(e) => setPassword(e.target.value)}
            onAnimationEnd={() => setShake(false)}
            aria-invalid={shake}
            className={`w-full rounded-xl border bg-panel py-3 pr-24 pl-4 text-text transition-colors outline-none placeholder:text-muted focus:border-accent/70 disabled:opacity-60 ${
              shake ? "animate-shake border-red-500/70" : "border-border"
            }`}
          />
          <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
              title={show ? "Hide password" : "Show password"}
              aria-pressed={show}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-text focus:outline-none"
            >
              {show ? <FiEyeOff className="h-5 w-5" /> : <FiEye className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={generate}
              disabled={busy}
              aria-label="Generate a strong random password"
              title="Generate a strong random password"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-text focus:outline-none disabled:opacity-60"
            >
              {copied ? <FiCheck className="h-5 w-5 text-accent" /> : <FiRefreshCw className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {password.length > 0 && (
          <p className="absolute top-full left-0 mt-2 text-xs text-muted tabular-nums select-none">{password.length}</p>
        )}
      </form>
    </div>
  );
}
