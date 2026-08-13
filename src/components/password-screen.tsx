"use client";

import { useState } from "react";
import { getBlob } from "@/lib/actions";
import { decryptJSON, deriveVault, saveSession, type Session } from "@/lib/crypto";
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

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-7 p-6">
      <h1 className="font-display text-6xl leading-none tracking-tight text-text select-none">
        Blinks
      </h1>
      <form onSubmit={submit} className="w-full max-w-xs">
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          spellCheck={false}
          disabled={busy}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onAnimationEnd={() => setShake(false)}
          aria-invalid={shake}
          className={`w-full rounded-xl border bg-panel px-4 py-3 text-center text-text transition-colors outline-none placeholder:text-muted focus:border-accent/70 disabled:opacity-60 ${
            shake ? "animate-shake border-red-500/70" : "border-border"
          }`}
        />
      </form>
    </div>
  );
}
