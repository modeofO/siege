import Link from "next/link";

/**
 * Fixed-position clickable book that links to the crafting/abilities page.
 * Renders on every page as a background prop via layout.tsx.
 * Hidden on small screens to avoid crowding mobile layouts.
 */
export function BookLink() {
  return (
    <Link
      href="/craft"
      aria-label="Open Book of Abilities"
      className="hidden lg:block group transition-transform duration-300 ease-out hover:scale-105 hover:-translate-x-1"
      style={{
        position: "fixed",
        top: "5rem",
        right: "2rem",
        zIndex: 20,
      }}
    >
      <img
        src="/sprites/book_preview.png"
        alt=""
        className="w-56 xl:w-72 h-auto drop-shadow-[0_8px_24px_rgba(0,0,0,0.65)] transition-[filter] duration-300 ease-out group-hover:drop-shadow-[0_0_28px_rgba(218,165,32,0.35)] group-hover:brightness-110"
      />
      <span
        className="absolute left-1/2 -translate-x-1/2 -bottom-6 text-[10px] tracking-[0.3em] text-[#c8a44e]/0 group-hover:text-[#c8a44e]/90 transition-colors duration-300 whitespace-nowrap font-serif pointer-events-none"
      >
        BOOK OF ABILITIES
      </span>
    </Link>
  );
}
