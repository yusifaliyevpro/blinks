"use client";

import * as motion from "motion/react-m";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { FiCheck, FiLoader, FiTrash2 } from "react-icons/fi";
import type { LinkItem } from "@/lib/types";
import { hostOf, prettyUrl } from "@/lib/url-utils";

export type DisplayLink = LinkItem & { pending?: boolean };

type LinkCardProps = {
  link: DisplayLink;
  index: number;
  onDelete: (id: string) => void;
  pulse?: number;
};

export function LinkCard({ link, index, onDelete, pulse = 0 }: LinkCardProps) {
  const [imageOk, setImageOk] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const cardRef = useRef<HTMLAnchorElement>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showImage = Boolean(link.image) && imageOk;

  // On each pulse nonce change (same link pasted again): flash the card and
  // scroll it into view. Driven via the DOM so it can't cascade a render.
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

  // Two-step delete: first click arms, a second within 3s deletes; else disarms.
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
      className="group/row flex items-stretch"
    >
      <a
        ref={cardRef}
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex min-w-0 flex-1 items-start gap-4 rounded-xl border border-border bg-panel p-3 transition-colors hover:bg-hover"
      >
        {/* When there's a thumbnail, the text keeps a fixed (responsive) width
              so it truncates at the same point regardless of hover; the slack
              between it and the image (ml-auto) absorbs the delete button's
              slide-in. Text-only cards keep filling the row. */}
        <div className={`mt-2.25 min-w-0 ${showImage ? "basis-72 sm:basis-80" : "flex-1"}`}>
          {link.pending && !link.title ? (
            <div className="flex items-center gap-2 text-muted">
              <FiLoader className="h-4 w-4 animate-spin" />
              <span className="text-sm select-none">{hostOf(link.url)}</span>
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
            loading={index === 0 ? "eager" : "lazy"}
            unoptimized
            width={1200}
            height={630}
            sizes="(min-width: 640px) 13rem, 10rem"
            // No referrer to third-party image hosts — consistent with the
            // app's no-referrer policy and the zero-knowledge posture.
            referrerPolicy="no-referrer"
            onError={() => setImageOk(false)}
            className="ml-auto aspect-1200/630 w-40 shrink-0 self-center rounded-lg border border-border/60 object-cover select-none sm:w-52"
          />
        )}
      </a>

      {/* Hidden (zero width) until the row is hovered/focused; then it slides
            open and the card's right edge glides left to make room. Kept visible
            on coarse pointers (touch), which have no hover. */}
      <button
        type="button"
        // Never keyboard-reachable, so a stray double keypress can't delete.
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleDeleteClick}
        aria-label={confirming ? "Confirm delete" : "Delete link"}
        title={confirming ? "Click again to delete" : "Delete link"}
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border transition-all duration-200 ease-out ${
          confirming
            ? "ml-2 w-12 border-red-500/50 bg-red-500/10 text-red-400 opacity-100"
            : "ml-0 w-0 border-border bg-panel text-muted opacity-0 group-focus-within/row:ml-2 group-focus-within/row:w-12 group-focus-within/row:opacity-100 group-hover/row:ml-2 group-hover/row:w-12 group-hover/row:opacity-100 hover:border-red-500/40 hover:bg-hover hover:text-red-400 pointer-coarse:ml-2 pointer-coarse:w-12 pointer-coarse:opacity-100"
        }`}
      >
        {confirming ? <FiCheck className="h-4 w-4" /> : <FiTrash2 className="h-4 w-4" />}
      </button>
    </motion.li>
  );
}
