"use client";

import { useEffect, useRef, useState } from "react";
import { FiCheck } from "react-icons/fi";

const MAX_TITLE = 80;
const AUTOSAVE_MS = 3000;

// Inline, borderless editable title. Autosaves 3s after typing stops (or on
// Enter) via the parent's `onSave`, and flashes a subtle check on success.
// Also mirrors the title into the document/tab title.
export function VaultTitle({
  initialTitle,
  onSave,
}: {
  initialTitle: string;
  onSave: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [saved, setSaved] = useState(false);
  const savedRef = useRef(initialTitle); // last persisted value
  const draftRef = useRef(initialTitle); // latest typed value
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = title.trim();
    document.title = t ? `${t} | Blinks` : "Blinks";
    return () => {
      document.title = "Blinks";
    };
  }, [title]);

  useEffect(() => {
    return () => {
      clearTimeout(timer.current ?? undefined);
    };
  }, []);

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function save() {
    clearTimeout(timer.current ?? undefined);
    const value = draftRef.current.trim().slice(0, MAX_TITLE);
    if (value === savedRef.current) return;
    void (async () => {
      try {
        await onSave(value);
        savedRef.current = value;
        flashSaved();
      } catch {
        // Parent surfaces the error; leave the draft as-is to retry.
      }
    })();
  }

  function onChange(value: string) {
    setTitle(value);
    draftRef.current = value;
    clearTimeout(timer.current ?? undefined);
    timer.current = setTimeout(save, AUTOSAVE_MS);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
      e.currentTarget.blur();
    }
  }

  return (
    <div className="flex justify-center">
      <div className="relative max-w-full">
        <input
          type="text"
          value={title}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="untitled"
          maxLength={MAX_TITLE}
          size={Math.max(title.length, 8) + 1}
          spellCheck={false}
          aria-label="Vault title"
          className="max-w-full bg-transparent text-center font-display text-3xl text-text outline-none placeholder:text-muted/40"
        />
        <FiCheck
          aria-hidden="true"
          className={`absolute top-1/2 left-full ml-2 h-4 w-4 -translate-y-1/2 text-accent transition-opacity duration-300 ${
            saved ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>
    </div>
  );
}
