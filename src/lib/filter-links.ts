// Client-side filter + sort for the decrypted vault. Pure view logic: the
// encrypted blob and commit order are untouched.
import type { LinkItem } from "./types";

export type SortMode = "newest" | "oldest" | "az";

export function filterLinks<T extends LinkItem>(
  links: T[],
  query: string,
  sort: SortMode,
  activeCategory: string | null = null,
): T[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const kept = links.filter((l) => {
    if (activeCategory !== null && (l.category ?? "") !== activeCategory) return false;
    if (tokens.length === 0) return true;
    const hay = `${l.title} ${l.description} ${l.url} ${l.category ?? ""}`.toLowerCase();
    // `@cat` narrows to an exact category; anything else is substring over all.
    return tokens.every((t) =>
      t.startsWith("@") && t.length > 1 ? (l.category ?? "") === t.slice(1) : hay.includes(t),
    );
  });
  if (sort === "oldest") kept.sort((a, b) => a.createdAt - b.createdAt);
  else if (sort === "az")
    kept.sort((a, b) => (a.title || a.url).localeCompare(b.title || b.url, undefined, { sensitivity: "base" }));
  else kept.sort((a, b) => b.createdAt - a.createdAt);
  return kept;
}
