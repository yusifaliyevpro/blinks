import { beforeEach, describe, expect, it } from "vitest";
import { loadBackendPreference, saveBackendPreference } from "@/lib/preferences";

beforeEach(() => {
  localStorage.clear();
});

describe("backend preference", () => {
  it("returns null when no preference has been saved", () => {
    expect(loadBackendPreference()).toBeNull();
  });

  it("round-trips a saved preference", () => {
    saveBackendPreference("local");
    expect(loadBackendPreference()).toBe("local");
    saveBackendPreference("redis");
    expect(loadBackendPreference()).toBe("redis");
  });

  it("ignores an unrecognized stored value", () => {
    localStorage.setItem("blinks.backend.pref", "sqlite");
    expect(loadBackendPreference()).toBeNull();
  });
});
