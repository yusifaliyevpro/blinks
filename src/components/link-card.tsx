"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { FiLoader, FiTrash2 } from "react-icons/fi";
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
  const [pulsing, setPulsing] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const showImage = Boolean(link.image) && imageOk;

  // Re-runs whenever the pulse nonce changes (i.e. the same link was pasted
  // again): flash the card and bring it into view to say "I'm already here".
  useEffect(() => {
    if (!pulse) return;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setPulsing(true);
    const timer = setTimeout(() => setPulsing(false), 650);
    return () => clearTimeout(timer);
  }, [pulse]);

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
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`group flex min-w-0 flex-1 items-center gap-4 rounded-xl border bg-panel p-3 transition-colors hover:bg-hover ${
          pulsing ? "pulse-highlight border-accent/60" : "border-border"
        }`}
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
              {link.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted">{link.description}</p>
              )}
              <p className="mt-1.5 truncate text-xs text-muted/60">{prettyUrl(link.url)}</p>
            </>
          )}
        </div>

        {showImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={link.image}
            alt=""
            loading="lazy"
            onError={() => setImageOk(false)}
            className="aspect-[1200/630] w-40 shrink-0 rounded-lg border border-border/60 object-cover sm:w-52"
          />
        )}
      </a>

      <button
        type="button"
        aria-label="Delete link"
        onClick={() => onDelete(link.id)}
        className="flex shrink-0 items-center justify-center rounded-xl border border-border bg-panel px-3 text-muted transition-colors hover:border-red-500/40 hover:bg-hover hover:text-red-400"
      >
        <FiTrash2 className="h-4 w-4" />
      </button>
    </motion.li>
  );
}
