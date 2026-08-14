// oxlint-disable-next-line import/no-unassigned-import -- side-effect import that augments vitest's expect with jest-dom matchers
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount React trees and reset the DOM between UI tests so state can't leak.
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
