"use client";

import Image from "next/image";

export function CompassLink() {
  return (
    <a
      href="https://siege-mauve.vercel.app/"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open Field Guide"
      className="hidden lg:block group pointer-events-auto transition-transform duration-300 ease-out hover:scale-105 hover:translate-x-1"
      style={{
        position: "fixed",
        top: "8rem",
        left: "0.5rem",
        zIndex: 20,
      }}
    >
      <Image
        src="/sprites/compass.png"
        alt=""
        width={192}
        height={192}
        className="w-40 xl:w-48 h-auto drop-shadow-[0_8px_24px_rgba(0,0,0,0.65)] transition-[filter] duration-300 ease-out group-hover:drop-shadow-[0_0_28px_rgba(200,164,78,0.35)] group-hover:brightness-110"
      />
      <span
        className="absolute left-1/2 -translate-x-1/2 -bottom-6 text-[10px] tracking-[0.3em] whitespace-nowrap font-serif pointer-events-none transition-colors duration-300"
      >
        <span className="text-[#c8a44e]/0 group-hover:text-[#c8a44e]/90 transition-colors duration-300">
          FIELD GUIDE
        </span>
      </span>
    </a>
  );
}
