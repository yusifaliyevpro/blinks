"use client";

import { useEffect, useRef } from "react";

// Blinks eye. Open (password hidden): the pupil tracks the cursor. Closed
// (password visible): it blinks shut. Eye inherits currentColor; pupil uses the
// site accent. The pupil follows the cursor via direct DOM writes in an event
// handler (no re-render).
export function Logo({ open = true, className }: { open?: boolean; className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pupilRef = useRef<SVGGElement>(null);

  useEffect(() => {
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
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 48 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <g style={{ opacity: open ? 1 : 0, transition: "opacity 0.2s ease" }}>
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
        d="M6 15C14 22 34 22 42 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ opacity: open ? 0 : 1, transition: "opacity 0.2s ease" }}
      />
    </svg>
  );
}
