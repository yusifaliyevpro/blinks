// Non-secret UI preferences, persisted in localStorage so they survive across
// tabs and sessions. Nothing here reveals anything about the vault contents —
// only how the app is configured. Add future preferences alongside these.

import type { StorageBackend } from "./types";

const LS_BACKEND = "blinks.backend.pref";

// Which backend to preselect on the password screen next time.
export function saveBackendPreference(backend: StorageBackend): void {
  try {
    localStorage.setItem(LS_BACKEND, backend);
  } catch {
    // storage unavailable (private mode / disabled) — preference is optional
  }
}

export function loadBackendPreference(): StorageBackend | null {
  try {
    const value = localStorage.getItem(LS_BACKEND);
    return value === "local" || value === "redis" ? value : null;
  } catch {
    return null;
  }
}
