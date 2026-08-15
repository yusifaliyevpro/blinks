"use client";

import { useRef } from "react";
import { FiDownload, FiUpload } from "react-icons/fi";
import { toast } from "sonner";
import * as z from "zod/mini";
import type { LinkItem } from "@/lib/types";
import { canonicalKey, isValidLink, normalizeUrl } from "@/lib/url-utils";

const importLinkSchema = z.object({
  url: z.string(),
  title: z.optional(z.string()),
  description: z.optional(z.string()),
  image: z.optional(z.string()),
  createdAt: z.optional(z.number()),
});

const importSchema = z.array(importLinkSchema);

function exportFilename(title: string): string {
  const slug =
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "blinks";
  return `${slug}-${new Date().toISOString().slice(0, 10)}.json`;
}

type VaultIOProps = {
  // Getters so we read the freshest committed state, not a render-time snapshot.
  getLinks: () => LinkItem[];
  getTitle: () => string;
  onImport: (links: LinkItem[]) => void;
};

// Export / import controls: owns the file plumbing, JSON, validation and dedup.
export function VaultIO({ getLinks, getTitle, onImport }: VaultIOProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  // Export links only (never the title) as JSON, with full cached metadata.
  function handleExport() {
    const links = getLinks();
    if (links.length === 0) {
      toast("Nothing to export yet.");
      return;
    }
    const json = JSON.stringify(links, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename(getTitle());
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so picking the same file again re-fires onChange.
    event.target.value = "";
    if (!file) return;

    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      toast.error("Import failed — the file isn't valid JSON.");
      return;
    }

    const parsed = importSchema.safeParse(raw);
    if (!parsed.success) {
      toast.error("Import failed — the file isn't a valid Blinks export.");
      return;
    }

    // Skip links already present and de-dup within the file itself (by canonical
    // URL). Fresh ids are minted so re-importing can't collide with existing ones.
    const seen = new Set(getLinks().map((l) => canonicalKey(l.url)));
    const toAdd: LinkItem[] = [];
    for (const entry of parsed.data) {
      const url = normalizeUrl(entry.url);
      if (!isValidLink(url)) continue;
      const key = canonicalKey(url);
      if (seen.has(key)) continue;
      seen.add(key);
      toAdd.push({
        id: crypto.randomUUID(),
        url,
        title: entry.title || url,
        description: entry.description ?? "",
        image: entry.image ?? "",
        createdAt: entry.createdAt ?? Date.now(),
      });
    }

    if (toAdd.length === 0) {
      toast("Nothing to import — every link is already saved.");
      return;
    }

    onImport(toAdd);
  }

  const buttonClass =
    "flex items-center gap-1.5 rounded-lg border border-border bg-panel/80 px-2.5 py-1.5 text-xs text-muted backdrop-blur transition-colors hover:bg-hover hover:text-text focus:outline-none";

  return (
    <div className="fixed top-4 left-4 z-10 flex items-center gap-2">
      <button
        type="button"
        onClick={handleExport}
        aria-label="Export links"
        title="Export links"
        className={buttonClass}
      >
        <FiDownload className="h-4 w-4" />
        <span className="hidden sm:flex">Export</span>
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        aria-label="Import links"
        title="Import links"
        className={buttonClass}
      >
        <FiUpload className="h-4 w-4" />
        <span className="hidden sm:flex">Import</span>
      </button>
      <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleFile} className="hidden" />
    </div>
  );
}
