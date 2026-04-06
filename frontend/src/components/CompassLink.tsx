"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Fixed-position clickable compass that lives in the layout.
 * Mirrors BookLink: book is top-right → /craft, compass is top-left → /how-to-play.
 *
 * Hover: subtle lift + warm drop shadow + caption reveal.
 * Hidden on /how-to-play since the user is already there.
 */
export function CompassLink() {
  const pathname = usePathname();

  if (pathname === "/how-to-play") return null;

  return (
    <Link
      href="/how-to-play"
      aria-label="Open Field Guide"
      className="hidden lg:block group pointer-events-auto transition-transform duration-300 ease-out hover:scale-105 hover:translate-x-1"
      style={{
        position: "fixed",
        top: "5rem",
        left: "2rem",
        zIndex: 20,
      }}
    >
      <img
        src="/sprites/compass.png"
        alt=""
        className="w-56 xl:w-72 h-auto drop-shadow-[0_8px_24px_rgba(0,0,0,0.65)] transition-[filter] duration-300 ease-out group-hover:drop-shadow-[0_0_28px_rgba(200,164,78,0.35)] group-hover:brightness-110"
      />
      <span
        className="absolute left-1/2 -translate-x-1/2 -bottom-6 text-[10px] tracking-[0.3em] whitespace-nowrap font-serif pointer-events-none transition-colors duration-300"
      >
        <span className="text-[#c8a44e]/0 group-hover:text-[#c8a44e]/90 transition-colors duration-300">
          FIELD GUIDE
        </span>
      </span>
    </Link>
  );
}
