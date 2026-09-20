// Shared category rules: lowercase, tight charset, single value per link.
// Enforced at every write path (add, edit, import, decrypt-normalize).
export const MAX_CATEGORY_LENGTH = 24;

export function normalizeCategory(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, MAX_CATEGORY_LENGTH);
}

// Distinct categories across the vault, alphabetical, for the filter row.
// Links without one group under "" (rendered as "Uncategorized").
export function allCategories(links: { category?: string }[]): string[] {
  const set = new Set<string>();
  for (const l of links) if (l.category) set.add(l.category);
  return [...set].toSorted((a, b) => a.localeCompare(b));
}

// Normalize a vault-level category list: lowercase, deduped, capped, sorted.
export const MAX_CATEGORIES = 24;

export function normalizeCategories(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const c of raw) {
    const n = normalizeCategory(c);
    if (n && !out.includes(n)) out.push(n);
    if (out.length >= MAX_CATEGORIES) break;
  }
  return out.toSorted((a, b) => a.localeCompare(b));
}
