"use client";

import { motion } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { FiCheck, FiLoader, FiTrash2 } from "react-icons/fi";
import type { LinkItem } from "@/lib/types";

export type DisplayLink = LinkItem & { pending?: boolean };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Host + path, without protocol or trailing slash, for a compact URL line.
function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return u.hostname.replace(/^www\./, "") + path + u.search;
  } catch {
    return url;
  }
}

export function LinkCard({
  link,
  onDelete,
  pulse = 0,
}: {
  link: DisplayLink;
  onDelete: (id: string) => void;
  pulse?: number;
}) {
  const [imageOk, setImageOk] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const cardRef = useRef<HTMLAnchorElement>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showImage = Boolean(link.image) && imageOk;

  // Re-runs whenever the pulse nonce changes (i.e. the same link was pasted
  // again): flash the card and bring it into view to say "I'm already here".
  // Driven imperatively via the DOM (no React state) so it can't cascade a
  // render — the class is removed once the CSS animation ends.
  useEffect(() => {
    if (!pulse) return undefined;
    const card = cardRef.current;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (!card) return undefined;

    card.classList.remove("pulse-highlight");
    void card.offsetWidth; // force reflow so the animation restarts on repeats
    card.classList.add("pulse-highlight");

    const onEnd = () => card.classList.remove("pulse-highlight");
    card.addEventListener("animationend", onEnd, { once: true });
    return () => card.removeEventListener("animationend", onEnd);
  }, [pulse]);

  useEffect(() => {
    return () => {
      clearTimeout(confirmTimer.current ?? undefined);
    };
  }, []);

  // Two-step delete: first click arms it (shows a confirm icon), a second click
  // within 3s actually deletes — otherwise it disarms itself.
  function handleDeleteClick() {
    if (confirming) {
      clearTimeout(confirmTimer.current ?? undefined);
      setConfirming(false);
      onDelete(link.id);
      return;
    }
    setConfirming(true);
    confirmTimer.current = setTimeout(() => setConfirming(false), 3000);
  }

  return (
    <motion.li
      ref={ref}
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex items-stretch gap-2"
    >
      <a
        ref={cardRef}
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex min-w-0 flex-1 items-center gap-4 rounded-xl border border-border bg-panel p-3 transition-colors hover:bg-hover"
      >
        <div className="min-w-0 flex-1">
          {link.pending && !link.title ? (
            <div className="flex items-center gap-2 text-muted">
              <FiLoader className="h-4 w-4 animate-spin" />
              <span className="text-sm">{hostOf(link.url)}</span>
            </div>
          ) : (
            <>
              <p className="truncate font-medium text-text">{link.title}</p>
              {link.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{link.description}</p>}
              <p className="mt-1.5 truncate text-xs text-muted/60">{prettyUrl(link.url)}</p>
            </>
          )}
        </div>

        {showImage && (
          <Image
            src={link.image}
            alt=""
            loading="lazy"
            unoptimized
            width={1200}
            height={630}
            onError={() => setImageOk(false)}
            className="aspect-1200/630 w-40 shrink-0 rounded-lg border border-border/60 object-cover sm:w-52"
          />
        )}
      </a>

      <button
        type="button"
        // Never keyboard-reachable: no tab stop, and no focus on click — so an
        // accidental double keypress can't ever delete a link.
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleDeleteClick}
        aria-label={confirming ? "Confirm delete" : "Delete link"}
        title={confirming ? "Click again to delete" : "Delete link"}
        className={`flex shrink-0 items-center justify-center rounded-xl border px-3 transition-colors ${
          confirming
            ? "border-red-500/50 bg-red-500/10 text-red-400"
            : "border-border bg-panel text-muted hover:border-red-500/40 hover:bg-hover hover:text-red-400"
        }`}
      >
        {confirming ? <FiCheck className="h-4 w-4" /> : <FiTrash2 className="h-4 w-4" />}
      </button>
    </motion.li>
  );
}
