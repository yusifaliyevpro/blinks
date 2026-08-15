"use client";

import { useRef, useState } from "react";
import { FiCheck, FiEye, FiEyeOff, FiRefreshCw } from "react-icons/fi";
import { toast } from "sonner";
import { decryptVault, deriveVault, generatePassword, saveSession, type Session } from "@/lib/crypto";
import { allowPasswordManagers } from "@/lib/env.client";
import { loadBackendPreference, saveBackendPreference } from "@/lib/preferences";
import { getBlob } from "@/lib/store";
import type { LinkItem, StorageBackend } from "@/lib/types";
import { Logo } from "./logo";

const MIN_PASSWORD = 8;

export type Unlocked = {
  session: Session;
  title: string;
  links: LinkItem[];
  version: number;
};

export function PasswordScreen({
  redisAvailable,
  onUnlock,
}: {
  redisAvailable: boolean;
  onUnlock: (u: Unlocked) => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);
  // Preselect the last-used backend (remembered across tabs) when the remote
  // store is available; otherwise local is the only path.
  const [backend, setBackend] = useState<StorageBackend>(() =>
    redisAvailable ? (loadBackendPreference() ?? "redis") : "local",
  );
  const inputRef = useRef<HTMLInputElement>(null);

  function selectBackend(value: StorageBackend) {
    setBackend(value);
    saveBackendPreference(value);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    // Minimum 8 chars — a weak password is the user's own risk, but reject the
    // obviously-too-short ones (the generator produces 200). Shake + toast as
    // feedback (no native minLength, so the browser's own bubble never shows).
    if (!password || password.length < MIN_PASSWORD) {
      if (password.length > 0) {
        setShake(true);
        toast.error(`Password must be at least ${MIN_PASSWORD} characters.`);
      }
      return;
    }
    setBusy(true);
    setShake(false);

    try {
      const vault = await deriveVault(password);
      const blob = await getBlob(backend, vault.blobId);

      let title = "";
      let links: LinkItem[] = [];
      let version = 0;
      if (blob) {
        // Throws on a wrong password (AES-GCM auth failure).
        const data = await decryptVault(vault.key, blob.ciphertext);
        title = data.title;
        links = data.links;
        version = blob.version;
      }

      saveSession(vault.blobId, vault.encKeyBytes, vault.writeToken, backend);
      onUnlock({
        session: { blobId: vault.blobId, key: vault.key, writeToken: vault.writeToken, backend },
        title,
        links,
        version,
      });
    } catch {
      setPassword("");
      setBusy(false);
      setShake(true);
    }
  }

  function toggleShow() {
    setShow((s) => !s);
    inputRef.current?.focus();
  }

  function generate() {
    if (busy) return;
    const pw = generatePassword(200);
    setPassword(pw);
    setShake(false);
    inputRef.current?.focus();
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
        <div className="absolute inset-x-0 bottom-full mb-6 flex flex-col items-center justify-center gap-4">
          <Logo open={!show} className="h-14 w-auto text-text" />
          <h1 className="font-display text-6xl leading-none tracking-tight text-text select-none">Blinks</h1>
        </div>

        <div className="relative">
          <input
            ref={inputRef}
            type={show ? "text" : "password"}
            autoFocus
            autoComplete={allowPasswordManagers ? "current-password" : "off"}
            spellCheck={false}
            disabled={busy}
            value={password}
            placeholder="Password"
            // Discourage password managers unless NEXT_PUBLIC_ALLOW_PASSWORD_MANAGERS is set.
            data-1p-ignore={allowPasswordManagers ? undefined : true}
            data-lpignore={allowPasswordManagers ? undefined : "true"}
            data-bwignore={allowPasswordManagers ? undefined : "true"}
            data-form-type={allowPasswordManagers ? undefined : "other"}
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
              onClick={toggleShow}
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

        {redisAvailable && (
          <div
            role="radiogroup"
            aria-label="Storage backend"
            className="absolute top-full left-1/2 mt-7 flex w-36 -translate-x-1/2 rounded-lg border border-border bg-panel p-0.5 text-xs"
          >
            {/* Bordered chip that slides under the active segment (CSS transform). */}
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-md border border-border bg-elevated transition-transform duration-200 ease-out ${
                backend === "local" ? "translate-x-full" : "translate-x-0"
              }`}
            />
            {(
              [
                ["redis", "Redis"],
                ["local", "Local"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={backend === value}
                disabled={busy}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectBackend(value)}
                className={`relative z-10 flex-1 py-1.5 text-center transition-colors focus:outline-none disabled:opacity-60 ${
                  backend === value ? "text-text" : "text-muted hover:text-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}
