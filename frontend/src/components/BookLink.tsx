"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * Fixed-position clickable book that lives in the layout.
 *
 * On click, intercepts navigation and plays a 3-stage opening:
 *   idle     → book docked in top-right corner
 *   moving   → slides to center + scales up (closed sprite)
 *   half     → cross-fades to half-open sprite
 *   opening  → cross-fades to fully-open sprite
 *   then router.push('/craft') while open book is visible
 *
 * Hidden entirely on /craft since that page renders its own book.
 */
const MOVE_MS = 750;   // travel time from corner to center
const HALF_MS = 280;   // closed → half-open fade
const OPEN_MS = 320;   // half-open → open fade
const NAV_DELAY_MS = MOVE_MS + HALF_MS + OPEN_MS - 80; // fire nav just before full open settles

type Phase = "idle" | "moving" | "half" | "opening";

export function BookLink() {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    router.prefetch("/craft");
  }, [router]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (phase !== "idle") return;
      setPhase("moving");
      setTimeout(() => setPhase("half"), MOVE_MS);
      setTimeout(() => setPhase("opening"), MOVE_MS + HALF_MS);
      setTimeout(() => router.push("/craft"), NAV_DELAY_MS);
    },
    [phase, router],
  );

  useEffect(() => {
    if (pathname !== "/craft") setPhase("idle");
  }, [pathname]);

  if (pathname === "/craft") return null;

  const moving = phase !== "idle";
  const halfVisible = phase === "half" || phase === "opening";
  const openVisible = phase === "opening";

  return (
    <a
      href="/craft"
      onClick={handleClick}
      aria-label="Open Book of Abilities"
      className="hidden lg:block group pointer-events-auto"
      style={{
        position: "fixed",
        top: moving ? "50vh" : "5rem",
        right: moving ? "auto" : "2rem",
        left: moving ? "50vw" : "auto",
        transform: moving
          ? "translate(-50%, -50%) scale(1.6)"
          : "translate(0, 0) scale(1)",
        // Cubic bezier for a deliberate ease that starts gently and settles
        transition: `top ${MOVE_MS}ms cubic-bezier(0.5, 0, 0.2, 1), left ${MOVE_MS}ms cubic-bezier(0.5, 0, 0.2, 1), right ${MOVE_MS}ms cubic-bezier(0.5, 0, 0.2, 1), transform ${MOVE_MS}ms cubic-bezier(0.5, 0, 0.2, 1)`,
        zIndex: 30,
      }}
    >
      {/* Stacked sprites — each cross-fades in at its phase */}
      <div className="relative w-56 xl:w-72">
        {/* Closed — base sprite, fades out once half takes over */}
        <img
          src="/sprites/book_preview.png"
          alt=""
          className="w-full h-auto drop-shadow-[0_8px_24px_rgba(0,0,0,0.65)] group-hover:brightness-110"
          style={{
            opacity: halfVisible ? 0 : 1,
            transition: `opacity ${HALF_MS}ms ease-out, filter 300ms ease-out`,
          }}
        />
        {/* Half-open — fades in over the closed sprite */}
        <img
          src="/sprites/book_half.png"
          alt=""
          className="absolute top-1/2 left-1/2 h-auto drop-shadow-[0_10px_30px_rgba(0,0,0,0.7)]"
          style={{
            width: "130%", // half-open spans a bit wider due to raised cover
            transform: "translate(-50%, -50%)",
            opacity: halfVisible && !openVisible ? 1 : 0,
            transition: `opacity ${HALF_MS}ms ease-out`,
            pointerEvents: "none",
          }}
        />
        {/* Open — final frame, fades in over the half-open */}
        <img
          src="/sprites/book_open.png"
          alt=""
          className="absolute top-1/2 left-1/2 h-auto drop-shadow-[0_12px_40px_rgba(0,0,0,0.75)]"
          style={{
            width: "180%",
            transform: "translate(-50%, -50%)",
            opacity: openVisible ? 1 : 0,
            transition: `opacity ${OPEN_MS}ms ease-out`,
            pointerEvents: "none",
          }}
        />
      </div>
      <span
        className="absolute left-1/2 -translate-x-1/2 -bottom-6 text-[10px] tracking-[0.3em] whitespace-nowrap font-serif pointer-events-none transition-colors duration-300"
        style={{
          opacity: moving ? 0 : 1,
        }}
      >
        <span className="text-[#c8a44e]/0 group-hover:text-[#c8a44e]/90 transition-colors duration-300">
          BOOK OF ABILITIES
        </span>
      </span>
    </a>
  );
}
