"use client";

import { useEffect, useRef, useState } from "react";
import { FiCheck, FiEdit2, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { MAX_CATEGORIES, normalizeCategory } from "@/lib/categories";

export function CategoryManager({
  categories,
  counts,
  onAdd,
  onRename,
  onDelete,
}: {
  categories: string[];
  counts: Map<string, number>;
  onAdd: (name: string) => void;
  onRename: (old: string, next: string) => void;
  onDelete: (name: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (showAdd) inputRef.current?.focus();
  }, [showAdd]);

  function submit() {
    const next = normalizeCategory(draft);
    setDraft("");
    if (!next || categories.includes(next)) return;
    if (categories.length >= MAX_CATEGORIES) return;
    onAdd(next);
  }

  function submitRename(old: string) {
    const next = normalizeCategory(editDraft);
    setEditing(null);
    if (!next || next === old || categories.includes(next)) return;
    onRename(old, next);
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-panel px-3 py-2.5">
      <div className="flex items-center">
        <p className="text-xs font-medium text-muted select-none">
          Categories
          <span className="ml-1.5 tabular-nums opacity-60">
            {categories.length}/{MAX_CATEGORIES}
          </span>
        </p>
        {categories.length > 0 && categories.length < MAX_CATEGORIES && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setDraft("");
              setShowAdd((v) => !v);
            }}
            aria-expanded={showAdd}
            aria-label={showAdd ? "Cancel new category" : "Add category"}
            title={showAdd ? "Cancel" : "Add category"}
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-text focus:outline-none"
          >
            {showAdd ? <FiX className="h-3.5 w-3.5" /> : <FiPlus className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {categories.length > 0 && (
        <ul className="mt-2 space-y-1">
          {categories.map((cat) => (
            <li key={cat} className="group/cat flex items-center gap-1.5">
              {editing === cat ? (
                <input
                  ref={editRef}
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitRename(cat);
                    } else if (e.key === "Escape") {
                      setEditing(null);
                    }
                  }}
                  onBlur={() => submitRename(cat)}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={24}
                  aria-label={`Rename ${cat}`}
                  className="min-w-0 flex-1 rounded-md border border-accent/60 bg-elevated px-2 py-1 text-xs text-text outline-none"
                />
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-xs text-text">{cat}</span>
                  <span className="text-[11px] text-muted/60 tabular-nums">{counts.get(cat) ?? 0}</span>
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setEditing(cat);
                        setEditDraft(cat);
                        setConfirming(null);
                      }}
                      aria-label={`Rename ${cat}`}
                      title={`Rename ${cat}`}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-text focus:outline-none"
                    >
                      <FiEdit2 className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        if (confirming === cat) {
                          setConfirming(null);
                          onDelete(cat);
                        } else {
                          setConfirming(cat);
                          setTimeout(() => setConfirming((c) => (c === cat ? null : c)), 3000);
                        }
                      }}
                      aria-label={confirming === cat ? `Confirm delete ${cat}` : `Delete ${cat}`}
                      title={confirming === cat ? "Click again to delete" : `Delete ${cat}`}
                      className="flex h-6 w-6 items-center justify-center rounded-md transition-colors focus:outline-none"
                    >
                      {confirming === cat ? (
                        <FiCheck className="h-3 w-3 text-red-400" />
                      ) : (
                        <FiTrash2 className="h-3 w-3 text-muted" />
                      )}
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {(showAdd || categories.length === 0) && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                setDraft("");
                inputRef.current?.blur();
              }
            }}
            placeholder={categories.length === 0 ? "Create your first category" : "New category"}
            autoComplete="off"
            spellCheck={false}
            maxLength={24}
            aria-label="New category"
            disabled={categories.length >= MAX_CATEGORIES}
            className="min-w-0 flex-1 rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-xs text-text outline-none placeholder:text-muted/60 focus:border-accent/70 disabled:opacity-60"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
            disabled={!normalizeCategory(draft) || categories.length >= MAX_CATEGORIES}
            aria-label="Add category"
            title="Add category"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-hover hover:text-text focus:outline-none disabled:opacity-40"
          >
            <FiPlus className="h-3.5 w-3.5" />
          </button>
          {draft && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setDraft("")}
              aria-label="Clear category input"
              title="Clear"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-text focus:outline-none"
            >
              <FiX className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
