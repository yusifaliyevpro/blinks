"use client";

import { useEffect, useRef } from "react";

// Blinks eye. Open (password hidden): the pupil tracks the cursor. Closed
// (password visible): it blinks shut. Eye inherits currentColor; pupil uses the
// site accent. The pupil follows the cursor via direct DOM writes in an event
// handler (no re-render).
export function Logo({ open = true, className }: { open?: boolean; className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pupilRef = useRef<SVGGElement>(null);
  const openLidRef = useRef<SVGGElement>(null);
  const closedLidRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    // Idle blinking: when the cursor sits still (tiny jitters don't count) the
    // open eye blinks shut and reopens every few seconds, until real movement
    // resumes. Driven by direct DOM writes so it never re-renders. Only runs
    // while the eye is open — when it's already closed there's nothing to blink.
    let last = { x: 0, y: 0 };
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let blinkTimer: ReturnType<typeof setTimeout> | undefined;
    let blinking = false;

    const IDLE_MS = 2500; // stillness before blinking begins
    const MOVE_THRESHOLD = 8; // px; smaller moves are treated as jitter

    function endBlink() {
      const openLid = openLidRef.current;
      const closedLid = closedLidRef.current;
      if (openLid) openLid.style.opacity = "1";
      if (closedLid) closedLid.style.opacity = "0";
      blinking = false;
    }

    function blinkOnce() {
      if (!open) return;
      const openLid = openLidRef.current;
      const closedLid = closedLidRef.current;
      if (!openLid || !closedLid) return;
      blinking = true;
      openLid.style.opacity = "0";
      closedLid.style.opacity = "1";
      // Hold shut briefly, reopen, then schedule the next blink.
      blinkTimer = setTimeout(() => {
        endBlink();
        if (open) blinkTimer = setTimeout(blinkOnce, 2600 + Math.random() * 2200);
      }, 170);
    }

    function scheduleIdle() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(blinkOnce, IDLE_MS);
    }

    function cancelBlinking() {
      clearTimeout(idleTimer);
      clearTimeout(blinkTimer);
      if (blinking) endBlink();
    }

    function onMove(e: MouseEvent) {
      const svg = svgRef.current;
      const pupil = pupilRef.current;
      if (!svg || !pupil) return;
      const rect = svg.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const angle = Math.atan2(dy, dx);
      const strength = Math.min(Math.hypot(dx, dy) / 60, 1);
      const max = 2.3; // pupil travel in viewBox units
      pupil.style.transform = `translate(${Math.cos(angle) * max * strength}px, ${Math.sin(angle) * max * strength}px)`;

      // Only meaningful movement counts as activity; jitter is ignored so the
      // eye keeps blinking through it.
      if (Math.hypot(e.clientX - last.x, e.clientY - last.y) >= MOVE_THRESHOLD) {
        last = { x: e.clientX, y: e.clientY };
        cancelBlinking();
        if (open) scheduleIdle();
      }
    }

    window.addEventListener("mousemove", onMove);
    if (open) scheduleIdle();
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelBlinking();
    };
  }, [open]);

  return (
    <svg ref={svgRef} viewBox="0 0 48 32" fill="none" className={className} aria-hidden="true">
      <g ref={openLidRef} style={{ opacity: open ? 1 : 0, transition: "opacity 0.2s ease" }}>
        <path
          d="M3 16C11 2 37 2 45 16C37 30 11 30 3 16Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <g ref={pupilRef} style={{ transition: "transform 0.12s ease-out" }}>
          <circle cx="24" cy="16" r="6.5" stroke="currentColor" strokeWidth="2" />
          <circle cx="24" cy="16" r="3" fill="var(--color-accent)" />
        </g>
      </g>
      <path
        ref={closedLidRef}
        d="M6 15C14 22 34 22 42 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ opacity: open ? 0 : 1, transition: "opacity 0.2s ease" }}
      />
    </svg>
  );
}
