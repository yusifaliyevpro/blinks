import "@/lib/env.server";
import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// Self-hosted at build time (no runtime external font request).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: "variable",
});

// Display face for the wordmark.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: {
    default: "Blinks",
    template: "%s | Blinks",
  },
  description:
    "Zero-knowledge encrypted link manager: one password, everything encrypted in your browser, and the server only ever stores an opaque blob.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
