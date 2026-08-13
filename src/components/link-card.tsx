"use client";

import { motion } from "motion/react";
import { useState } from "react";
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

export function LinkCard({ link, onDelete }: { link: DisplayLink; onDelete: (id: string) => void }) {
  const [imageOk, setImageOk] = useState(true);
  const showImage = Boolean(link.image) && imageOk;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-4 rounded-xl border border-border bg-panel px-4 py-3.5 transition-colors hover:bg-hover"
      >
        <div className="min-w-0 flex-1">
          {link.pending && !link.title ? (
            <div className="flex items-center gap-2 text-muted">
              <FiLoader className="h-4 w-4 animate-spin" />
              <span className="text-sm">{hostOf(link.url)}</span>
            </div>
          ) : (
            <p className="truncate font-medium text-text">{link.title}</p>
          )}

          {link.description ? (
            <p className="mt-1 truncate text-sm text-muted">{link.description}</p>
          ) : (
            <p className="mt-1 truncate text-xs text-muted/70">{hostOf(link.url)}</p>
          )}
        </div>

        {showImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={link.image}
            alt=""
            loading="lazy"
            onError={() => setImageOk(false)}
            className="h-14 w-14 shrink-0 rounded-lg border border-border/60 object-cover"
          />
        )}

        <button
          type="button"
          aria-label="Delete link"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(link.id);
          }}
          className="shrink-0 rounded-lg p-2 text-muted opacity-0 transition-all group-hover:opacity-100 hover:bg-elevated hover:text-red-400 focus:opacity-100 focus:outline-none"
        >
          <FiTrash2 className="h-4 w-4" />
        </button>
      </a>
    </motion.li>
  );
}
