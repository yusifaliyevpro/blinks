"use client";

import { AnimatePresence, domAnimation, LazyMotion } from "motion/react";
import { startTransition, useEffect, useMemo, useOptimistic, useRef, useState } from "react";
import { FiCornerDownLeft, FiLogOut, FiSearch, FiX } from "react-icons/fi";
import { toast } from "sonner";
import { fetchMetadata } from "@/lib/actions";
import { MAX_CATEGORIES, normalizeCategory } from "@/lib/categories";
import { decryptVault, encryptJSON, type Session } from "@/lib/crypto";
import { filterLinks, type SortMode } from "@/lib/filter-links";
import { putBlob } from "@/lib/store";
import type { LinkItem, VaultData } from "@/lib/types";
import { canonicalKey, isValidLink, normalizeUrl } from "@/lib/url-utils";
import { CategoryManager } from "./category-manager";
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
  initialCategories?: string[];
  initialVersion: number;
  onLogout: () => void;
};

export function LinksView({
  session,
  initialTitle,
  initialLinks,
  initialCategories = [],
  initialVersion,
  onLogout,
}: LinksViewProps) {
  const [links, setLinks] = useState<LinkItem[]>(initialLinks);
  const [categories, setCategories] = useState<string[]>(() => [...initialCategories]);
  const [optimistic, applyOptimistic] = useOptimistic<DisplayLink[], OptimisticAction>(links, reducer);
  const [input, setInput] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [pulse, setPulse] = useState<{ id: string; n: number } | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const linksRef = useRef(links);
  const categoriesRef = useRef(categories);
  const versionRef = useRef(initialVersion);
  const titleRef = useRef(initialTitle); // last persisted title (base for commits)
  const inputRef = useRef<HTMLInputElement>(null);

  // Mirror latest state into refs so handlers/commit avoid stale closures.
  useEffect(() => {
    linksRef.current = links;
  }, [links]);

  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);

  // Debounce search so each keystroke doesn't re-filter a large vault.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 120);
    return () => clearTimeout(t);
  }, [query]);

  const visible = useMemo(
    () => filterLinks(optimistic, debouncedQuery, sort, activeCategory),
    [optimistic, debouncedQuery, sort, activeCategory],
  );
  const searching = debouncedQuery.trim().length > 0 || activeCategory !== null;
  const uncategorizedCount = useMemo(() => optimistic.filter((l) => !(l.category ?? "")).length, [optimistic]);
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of optimistic) {
      const c = l.category ?? "";
      if (c) m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  }, [optimistic]);

  function toggleCategory(cat: string) {
    setActiveCategory((prev) => (prev === cat ? null : cat));
  }

  // Links grouped under their category (active filter/search applied first).
  // Uncategorized always sorts last so named groups stay on top.
  const groups = useMemo(() => {
    const map = new Map<string, typeof visible>();
    for (const l of visible) {
      const key = l.category ?? "";
      const arr = map.get(key);
      if (arr) arr.push(l);
      else map.set(key, [l]);
    }
    return [...map.entries()].toSorted(([a], [b]) => {
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b);
    });
  }, [visible]);

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
    let base: VaultData = { title: titleRef.current, links: linksRef.current, categories: categoriesRef.current };
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
        categoriesRef.current = next.categories ?? [];
        titleRef.current = next.title;
        setLinks(next.links);
        setCategories(next.categories ?? []);
        return;
      }

      if (res.current) {
        base = await decryptVault(session.key, res.current.ciphertext);
        expected = res.current.version;
      } else {
        base = { title: "", links: [], categories: [] };
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

  // Add the validated, de-duped links from VaultIO. Shown in reverse to match the
  // prepended commit order; placeholders get a `pending-` id so they can't collide
  // with committed items mid-transition. Also adopts the merged vault category
  // list the importer computed (vault list + file list + link assignments).
  function handleImport(newLinks: LinkItem[], newCategories: string[]) {
    startTransition(async () => {
      for (let i = newLinks.length - 1; i >= 0; i--) {
        applyOptimistic({ type: "add", item: { ...newLinks[i], id: `pending-${newLinks[i].id}` } });
      }
      try {
        await commit((d) => ({ ...d, links: [...newLinks, ...d.links], categories: newCategories }));
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

  // Single write path for category assignment — same encrypted-blob commit.
  // Only allows categories from the vault list ("", = uncategorized).
  function handleCategory(id: string, raw: string) {
    const next = normalizeCategory(raw);
    if (next && !categoriesRef.current.includes(next)) {
      toast.error("Create the category first, then assign it.");
      return;
    }
    startTransition(async () => {
      try {
        await commit((d) => ({ ...d, links: d.links.map((l) => (l.id === id ? { ...l, category: next } : l)) }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save category.");
      }
    });
  }

  function handleAddCategory(raw: string) {
    const next = normalizeCategory(raw);
    if (!next) return;
    if (categoriesRef.current.includes(next)) return;
    if (categoriesRef.current.length >= MAX_CATEGORIES) {
      toast.error(`Category limit reached (${MAX_CATEGORIES}).`);
      return;
    }
    startTransition(async () => {
      try {
        await commit((d) => ({
          ...d,
          categories: [...(d.categories ?? []), next].toSorted((a, b) => a.localeCompare(b)),
        }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add category.");
      }
    });
  }

  function handleRenameCategory(old: string, raw: string) {
    const next = normalizeCategory(raw);
    if (!next || next === old) return;
    if (categoriesRef.current.includes(next)) {
      toast.error("That category already exists.");
      return;
    }
    startTransition(async () => {
      try {
        await commit((d) => ({
          ...d,
          categories: (d.categories ?? []).map((c) => (c === old ? next : c)),
          links: d.links.map((l) => ((l.category ?? "") === old ? { ...l, category: next } : l)),
        }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to rename category.");
      }
    });
  }

  function handleDeleteCategory(name: string) {
    startTransition(async () => {
      try {
        await commit((d) => ({
          ...d,
          categories: (d.categories ?? []).filter((c) => c !== name),
          links: d.links.map((l) => ((l.category ?? "") === name ? { ...l, category: "" } : l)),
        }));
        if (activeCategory === name) setActiveCategory(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete category.");
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-16 sm:pt-3 sm:pb-20">
      <VaultIO
        getLinks={() => linksRef.current}
        getCategories={() => categoriesRef.current}
        getTitle={() => titleRef.current}
        onImport={handleImport}
      />

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
          className={`w-full rounded-xl border bg-panel py-3 pr-14 pl-4 text-text transition-colors outline-none placeholder:text-muted placeholder:select-none focus:border-accent/70 ${
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
        <>
          <CategoryManager
            categories={categories}
            counts={categoryCounts}
            onAdd={handleAddCategory}
            onRename={handleRenameCategory}
            onDelete={handleDeleteCategory}
          />
          <p className="mt-16 text-center text-sm text-muted">Nothing saved yet.</p>
        </>
      ) : (
        <>
          <div className="mt-6 flex items-center gap-2">
            <div className="relative flex-1">
              <FiSearch className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${optimistic.length} ${optimistic.length === 1 ? "link" : "links"}`}
                aria-label="Search links"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-xl border border-border bg-panel py-2.5 pr-9 pl-9 text-sm text-text transition-colors outline-none placeholder:text-muted placeholder:select-none focus:border-accent/70"
              />
              {query && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  title="Clear search"
                  className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-text focus:outline-none"
                >
                  <FiX className="h-4 w-4" />
                </button>
              )}
            </div>
            <div
              role="group"
              aria-label="Sort links"
              className="flex shrink-0 rounded-xl border border-border bg-panel p-0.5 text-xs"
            >
              {(
                [
                  ["newest", "Newest"],
                  ["oldest", "Oldest"],
                  ["az", "A–Z"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setSort(value)}
                  aria-pressed={sort === value}
                  title={`Sort: ${label}`}
                  className={`rounded-lg px-2.5 py-1.5 transition-colors focus:outline-none ${
                    sort === value ? "bg-elevated text-text" : "text-muted hover:text-text"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <CategoryManager
            categories={categories}
            counts={categoryCounts}
            onAdd={handleAddCategory}
            onRename={handleRenameCategory}
            onDelete={handleDeleteCategory}
          />

          <div
            role="tablist"
            aria-label="Categories"
            className="-mx-5 mt-3 flex scrollbar-none items-center gap-1.5 overflow-x-auto px-5"
          >
            {[
              { name: null as string | null, count: optimistic.length },
              ...categories.map((cat) => ({
                name: cat as string | null,
                count: optimistic.filter((l) => (l.category ?? "") === cat).length,
              })),
              ...(uncategorizedCount > 0 ? [{ name: "" as string | null, count: uncategorizedCount }] : []),
            ].map(({ name, count }) => {
              const active = activeCategory === name;
              const label = name === null ? "All" : name || "Uncategorized";
              return (
                <button
                  key={label}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-pressed={active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setActiveCategory(name)}
                  title={name === null ? "Show all links" : `Show ${label}`}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors focus:outline-none ${
                    active
                      ? "border-accent/60 bg-accent/15 text-text"
                      : "border-border bg-panel text-muted hover:bg-hover hover:text-text"
                  }`}
                >
                  {label}
                  <span className="ml-1.5 tabular-nums opacity-60">{count}</span>
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <p className="mt-16 text-center text-sm text-muted">
              {activeCategory !== null ? (
                <>
                  No links in {activeCategory || "Uncategorized"}.
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setActiveCategory(null);
                      setQuery("");
                    }}
                    className="ml-2 text-accent hover:underline focus:outline-none"
                  >
                    Clear
                  </button>
                </>
              ) : (
                <>
                  No matches for &ldquo;{debouncedQuery.trim()}&rdquo;.
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setQuery("")}
                    className="ml-2 text-accent hover:underline focus:outline-none"
                  >
                    Clear
                  </button>
                </>
              )}
            </p>
          ) : (
            <>
              {searching && (
                <p className="mt-4 text-xs text-muted tabular-nums select-none" role="status">
                  {visible.length} of {optimistic.length} {optimistic.length === 1 ? "link" : "links"}
                </p>
              )}
              {activeCategory === null && !searching ? (
                <LazyMotion features={domAnimation}>
                  <ul className="mt-4 space-y-2">
                    <AnimatePresence initial={false} mode="popLayout">
                      {visible.map((link, index) => (
                        <LinkCard
                          key={link.id}
                          link={link}
                          index={index}
                          onDelete={handleDelete}
                          onCategory={(next) => handleCategory(link.id, next)}
                          onCategoryClick={toggleCategory}
                          allCategories={categories}
                          pulse={pulse && pulse.id === link.id ? pulse.n : 0}
                        />
                      ))}
                    </AnimatePresence>
                  </ul>
                </LazyMotion>
              ) : (
                <div className="mt-4 space-y-6">
                  {groups.map(([cat, items]) => {
                    const count = optimistic.filter((l) => (l.category ?? "") === cat).length;
                    return (
                      <section key={cat || "uncategorized"} aria-label={cat || "Uncategorized"}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => toggleCategory(cat)}
                          aria-pressed={activeCategory === cat}
                          title={
                            activeCategory === cat
                              ? `Remove ${cat || "Uncategorized"} filter`
                              : `Filter by ${cat || "Uncategorized"}`
                          }
                          className="group flex items-baseline gap-2 focus:outline-none"
                        >
                          <h2
                            className={`text-sm font-medium transition-colors ${
                              activeCategory === cat ? "text-text" : "text-muted group-hover:text-text"
                            }`}
                          >
                            {cat || "Uncategorized"}
                          </h2>
                          <span className="text-xs text-muted/60 tabular-nums">
                            {items.length !== count ? `${items.length} of ${count}` : count}
                          </span>
                        </button>
                        <LazyMotion features={domAnimation}>
                          <ul className="mt-2 space-y-2">
                            <AnimatePresence initial={false} mode="popLayout">
                              {items.map((link, index) => (
                                <LinkCard
                                  key={link.id}
                                  link={link}
                                  index={index}
                                  onDelete={handleDelete}
                                  onCategory={(next) => handleCategory(link.id, next)}
                                  onCategoryClick={toggleCategory}
                                  allCategories={categories}
                                  pulse={pulse && pulse.id === link.id ? pulse.n : 0}
                                />
                              ))}
                            </AnimatePresence>
                          </ul>
                        </LazyMotion>
                      </section>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
