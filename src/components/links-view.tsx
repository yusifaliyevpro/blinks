"use client";

import { AnimatePresence } from "motion/react";
import { startTransition, useEffect, useOptimistic, useRef, useState } from "react";
import { FiCornerDownLeft, FiLogOut } from "react-icons/fi";
import { toast } from "sonner";
import { fetchMetadata } from "@/lib/actions";
import { decryptVault, encryptJSON, type Session } from "@/lib/crypto";
import { putBlob } from "@/lib/store";
import type { LinkItem, VaultData } from "@/lib/types";
import { canonicalKey, isValidLink, normalizeUrl } from "@/lib/url-utils";
import { LinkCard, type DisplayLink } from "./link-card";
import { VaultIO } from "./vault-io";
import { VaultTitle } from "./vault-title";

type OptimisticAction = { type: "add"; item: DisplayLink } | { type: "remove"; id: string };

function reducer(state: DisplayLink[], action: OptimisticAction): DisplayLink[] {
  if (action.type === "add") return [action.item, ...state];
  return state.filter((l) => l.id !== action.id);
}

type LinksViewProps = {
  session: Session;
  initialTitle: string;
  initialLinks: LinkItem[];
  initialVersion: number;
  onLogout: () => void;
};

export function LinksView({ session, initialTitle, initialLinks, initialVersion, onLogout }: LinksViewProps) {
  const [links, setLinks] = useState<LinkItem[]>(initialLinks);
  const [optimistic, applyOptimistic] = useOptimistic<DisplayLink[], OptimisticAction>(links, reducer);
  const [input, setInput] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [pulse, setPulse] = useState<{ id: string; n: number } | null>(null);

  const linksRef = useRef(links);
  const versionRef = useRef(initialVersion);
  const titleRef = useRef(initialTitle); // last persisted title (base for commits)
  const inputRef = useRef<HTMLInputElement>(null);

  // Mirror latest links into a ref so handlers/commit avoid stale closures.
  useEffect(() => {
    linksRef.current = links;
  }, [links]);

  // Enter with nothing interactive focused jumps back to the link input.
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

  // Encrypt and write the whole vault under optimistic concurrency. On a version
  // conflict, re-fetch, re-apply the same mutation, and retry so a second tab
  // can't clobber data.
  async function commit(mutate: (current: VaultData) => VaultData): Promise<void> {
    let base: VaultData = { title: titleRef.current, links: linksRef.current };
    let expected = versionRef.current;

    for (let attempt = 0; attempt < 6; attempt++) {
      const next = mutate(base);
      const ciphertext = await encryptJSON(session.key, next);
      const res = await putBlob(session.backend, {
        blobId: session.blobId,
        ciphertext,
        expectedVersion: expected,
        writeToken: session.writeToken,
      });

      if ("version" in res) {
        versionRef.current = res.version;
        linksRef.current = next.links;
        titleRef.current = next.title;
        setLinks(next.links);
        return;
      }

      if (res.current) {
        base = await decryptVault(session.key, res.current.ciphertext);
        expected = res.current.version;
      } else {
        base = { title: "", links: [] };
        expected = 0;
      }
    }
    throw new Error("Could not save after several attempts — please retry.");
  }

  async function saveTitle(value: string) {
    try {
      await commit((d) => ({ ...d, title: value }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
      throw err;
    }
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
        await commit((d) => ({ ...d, links: [item, ...d.links] }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save.");
      }
    });
  }

  // Add the validated, de-duped links from VaultIO. Optimistically shown in
  // reverse to match the prepended commit order; placeholders get a distinct
  // `pending-` id so they can't collide with the committed items mid-transition.
  function handleImport(newLinks: LinkItem[]) {
    startTransition(async () => {
      for (let i = newLinks.length - 1; i >= 0; i--) {
        applyOptimistic({ type: "add", item: { ...newLinks[i], id: `pending-${newLinks[i].id}` } });
      }
      try {
        await commit((d) => ({ ...d, links: [...newLinks, ...d.links] }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to import.");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      applyOptimistic({ type: "remove", id });
      try {
        await commit((d) => ({ ...d, links: d.links.filter((l) => l.id !== id) }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete.");
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-16 sm:pt-3 sm:pb-20">
      <VaultIO getLinks={() => linksRef.current} getTitle={() => titleRef.current} onImport={handleImport} />

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

      <div className="mb-5">
        <VaultTitle initialTitle={initialTitle} onSave={saveTitle} />
      </div>

      <form onSubmit={handleAdd} className="relative">
        <input
          ref={inputRef}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste a link"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setInvalid(false);
          }}
          onAnimationEnd={() => setInvalid(false)}
          aria-invalid={invalid}
          className={`w-full rounded-xl border bg-panel py-3 pr-14 pl-4 text-text transition-colors outline-none placeholder:text-muted focus:border-accent/70 ${
            invalid ? "animate-shake border-red-500/70" : "border-border"
          }`}
        />
        <button
          type="submit"
          // Trailing icon button — preventDefault on mousedown so clicking it
          // never steals focus from the input.
          onMouseDown={(e) => e.preventDefault()}
          aria-label="Add link"
          title="Add link"
          className="absolute top-1/2 right-2 flex h-8 w-9 -translate-y-1/2 items-center justify-center rounded-lg border border-border bg-panel text-muted transition-colors hover:bg-hover hover:text-text focus:outline-none"
        >
          <FiCornerDownLeft className="h-4 w-4" />
        </button>
      </form>

      {optimistic.length === 0 ? (
        <p className="mt-16 text-center text-sm text-muted">Nothing saved yet.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          <AnimatePresence initial={false} mode="popLayout">
            {optimistic.map((link, index) => (
              <LinkCard
                key={link.id}
                link={link}
                index={index}
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
