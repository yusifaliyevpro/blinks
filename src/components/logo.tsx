"use client";

import { useEffect, useRef } from "react";

export function Logo({ open = true, className }: { open?: boolean; className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pupilRef = useRef<SVGGElement>(null);

  useEffect(() => {
    // Cache the eye's center so we don't force a layout (getBoundingClientRect)
    // on every mousemove; refresh it on resize/scroll instead.
    const center = { x: 0, y: 0 };
    function measure() {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      center.x = rect.left + rect.width / 2;
      center.y = rect.top + rect.height / 2;
    }
    measure();

    // Coalesce bursts of mousemove events into one style write per frame.
    const pending = { x: 0, y: 0, frame: 0 };
    function apply() {
      pending.frame = 0;
      const pupil = pupilRef.current;
      if (!pupil) return;
      const dx = pending.x - center.x;
      const dy = pending.y - center.y;
      const angle = Math.atan2(dy, dx);
      const strength = Math.min(Math.hypot(dx, dy) / 60, 1);
      const max = 2.3; // pupil travel in viewBox units
      pupil.style.transform = `translate(${Math.cos(angle) * max * strength}px, ${Math.sin(angle) * max * strength}px)`;
    }
    function onMove(e: MouseEvent) {
      pending.x = e.clientX;
      pending.y = e.clientY;
      if (!pending.frame) pending.frame = requestAnimationFrame(apply);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      if (pending.frame) cancelAnimationFrame(pending.frame);
    };
  }, []);

  return (
    <svg ref={svgRef} viewBox="0 0 48 32" fill="none" className={className} aria-hidden="true">
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
