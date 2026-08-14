import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Blinks";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Satori needs a ttf/otf/woff (not the woff2 that next/font caches), so the
// display face is vendored under assets/ and read once at module scope.
const instrumentSerif = await readFile(join(process.cwd(), "assets/InstrumentSerif-Regular.ttf"));

// The eye mark, colors inlined (satori won't resolve currentColor / CSS vars):
// stroke = --color-text, pupil = --color-accent.
const eye = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32" fill="none"><path d="M3 16C11 2 37 2 45 16C37 30 11 30 3 16Z" stroke="#ececf0" stroke-width="2" stroke-linejoin="round"/><circle cx="24" cy="16" r="6.5" stroke="#ececf0" stroke-width="2"/><circle cx="24" cy="16" r="3" fill="#6366f1"/></svg>`;
const eyeSrc = `data:image/svg+xml;base64,${Buffer.from(eye).toString("base64")}`;

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
        background: "#0a0a0c",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={eyeSrc} width={228} height={152} alt="" />
      <div
        style={{
          fontFamily: "Instrument Serif",
          fontSize: 168,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color: "#ececf0",
        }}
      >
        Blinks
      </div>
    </div>,
    {
      ...size,
      fonts: [{ name: "Instrument Serif", data: instrumentSerif, style: "normal", weight: 400 }],
    },
  );
}
