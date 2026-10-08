// oxlint-disable-next-line import/no-unassigned-import -- side-effect import that augments vitest's expect with jest-dom matchers
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// happy-dom's Animation.cancel() leaves `finished` rejected but unhandled; browsers mark it handled per the
// Web Animations spec, so do the same to stop motion's cancelled animations surfacing as unhandled rejections.
// oxlint-disable-next-line typescript/unbound-method -- re-invoked below with the animation as `this`
const cancelAnimation = Animation.prototype.cancel;
Animation.prototype.cancel = function cancel(this: Animation) {
  this.finished.catch(() => {});
  cancelAnimation.call(this);
};

// Unmount React trees and reset the DOM between UI tests so state can't leak.
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
