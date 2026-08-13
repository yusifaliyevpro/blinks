"use client";

import { AnimatePresence } from "motion/react";
import { startTransition, useEffect, useOptimistic, useRef, useState } from "react";
import { FiLogOut } from "react-icons/fi";
import * as z from "zod/mini";
import { fetchMetadata, putBlob } from "@/lib/actions";
import { decryptJSON, encryptJSON, type Session } from "@/lib/crypto";
import type { LinkItem } from "@/lib/types";
import { LinkCard, type DisplayLink } from "./link-card";

const urlSchema = z.url();

// Accept a real link only: valid URL syntax and a dotted hostname (has a TLD),
// so bare words like "hello" — which normalize into a technically-valid
// https://hello — are rejected.
function isValidLink(url: string): boolean {
  if (!urlSchema.safeParse(url).success) return false;
  try {
    return new URL(url).hostname.includes(".");
  } catch {
    return false;
  }
}

type OptimisticAction = { type: "add"; item: DisplayLink } | { type: "remove"; id: string };

function reducer(state: DisplayLink[], action: OptimisticAction): DisplayLink[] {
  if (action.type === "add") return [action.item, ...state];
  return state.filter((l) => l.id !== action.id);
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Canonical form for matching an already-saved link: lowercased host, trailing
// slash dropped, so minor cosmetic differences still count as the same link.
function canonicalKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function LinksView({
  session,
  initialLinks,
  initialVersion,
  onLogout,
}: {
  session: Session;
  initialLinks: LinkItem[];
  initialVersion: number;
  onLogout: () => void;
}) {
  const [links, setLinks] = useState<LinkItem[]>(initialLinks);
  const [optimistic, applyOptimistic] = useOptimistic<DisplayLink[], OptimisticAction>(links, reducer);
  const [input, setInput] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which card to pulse, and a nonce so re-pasting the same link re-triggers it.
  const [pulse, setPulse] = useState<{ id: string; n: number } | null>(null);

  const linksRef = useRef(links);
  linksRef.current = links;
  const versionRef = useRef(initialVersion);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pressing Enter while nothing (or a non-interactive element) is focused jumps
  // back to the link input — so you can keep adding without reaching for it.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter") return;
      const el = document.activeElement;
      if (el === inputRef.current) return;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "A") return;
      if (el instanceof HTMLElement && el.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Encrypt the whole array and write it under optimistic concurrency control.
  // On a version conflict, re-fetch the latest, re-apply the same logical
  // mutation onto it, and retry — so a second open tab can never clobber data.
  async function commit(mutate: (current: LinkItem[]) => LinkItem[]): Promise<void> {
    let base = linksRef.current;
    let expected = versionRef.current;

    for (let attempt = 0; attempt < 6; attempt++) {
      const next = mutate(base);
      const ciphertext = await encryptJSON(session.key, next);
      const res = await putBlob({
        blobId: session.blobId,
        ciphertext,
        expectedVersion: expected,
      });

      if ("version" in res) {
        versionRef.current = res.version;
        linksRef.current = next;
        setLinks(next);
        return;
      }

      if (res.current) {
        base = await decryptJSON<LinkItem[]>(session.key, res.current.ciphertext);
        expected = res.current.version;
      } else {
        base = [];
        expected = 0;
      }
    }
    throw new Error("Could not save after several attempts — please retry.");
  }

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const url = normalizeUrl(input);
    if (!url) return;
    if (!isValidLink(url)) {
      setInvalid(true);
      return;
    }
    setInput("");
    setInvalid(false);
    setError(null);

    // Already saved? Don't add again — pulse the existing card instead.
    const key = canonicalKey(url);
    const existing = linksRef.current.find((l) => canonicalKey(l.url) === key);
    if (existing) {
      setPulse((p) => ({ id: existing.id, n: (p?.n ?? 0) + 1 }));
      return;
    }

    startTransition(async () => {
      const placeholder: DisplayLink = {
        id: `pending-${crypto.randomUUID()}`,
        url,
        title: "",
        description: "",
        image: "",
        createdAt: Date.now(),
        pending: true,
      };
      applyOptimistic({ type: "add", item: placeholder });

      let meta = { title: "", description: "", image: "" };
      try {
        meta = await fetchMetadata(url);
      } catch {
        // fetchMetadata already degrades gracefully; ignore and use fallbacks.
      }

      const item: LinkItem = {
        id: crypto.randomUUID(),
        url,
        title: meta.title || url,
        description: meta.description,
        image: meta.image,
        createdAt: Date.now(),
      };

      try {
        await commit((current) => [item, ...current]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save.");
      }
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ type: "remove", id });
      try {
        await commit((current) => current.filter((l) => l.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete.");
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
      <button
        type="button"
        onClick={onLogout}
        aria-label="Log out"
        title="Log out"
        className="fixed top-4 right-4 z-10 flex items-center gap-1.5 rounded-lg border border-border bg-panel/80 px-2.5 py-1.5 text-xs text-muted backdrop-blur transition-colors hover:bg-hover hover:text-text focus:outline-none"
      >
        <FiLogOut className="h-4 w-4" />
        Log out
      </button>

      <form onSubmit={handleAdd}>
        <input
          ref={inputRef}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste a link, press Enter"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setInvalid(false);
          }}
          onAnimationEnd={() => setInvalid(false)}
          aria-invalid={invalid}
          className={`w-full rounded-xl border bg-panel px-4 py-3 text-text transition-colors outline-none placeholder:text-muted focus:border-accent/70 ${
            invalid ? "animate-shake border-red-500/70" : "border-border"
          }`}
        />
      </form>

      {error && (
        <button
          type="button"
          onClick={() => setError(null)}
          className="mt-3 w-full rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-left text-sm text-red-300"
        >
          {error} <span className="text-red-300/60">(dismiss)</span>
        </button>
      )}

      {optimistic.length === 0 ? (
        <p className="mt-16 text-center text-sm text-muted">Nothing saved yet.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          <AnimatePresence initial={false} mode="popLayout">
            {optimistic.map((link) => (
              <LinkCard
                key={link.id}
                link={link}
                onDelete={handleDelete}
                pulse={pulse && pulse.id === link.id ? pulse.n : 0}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
