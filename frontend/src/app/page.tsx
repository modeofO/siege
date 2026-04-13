import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-10">
      <div className="text-center space-y-4">
        <h1 className="text-5xl md:text-7xl font-bold tracking-[0.3em] text-[#c8a44e] font-serif">
          SIEGE
        </h1>
        <p className="text-xs md:text-sm text-[#7a7060] tracking-[0.4em] font-serif">
          COMMIT · REVEAL · CONQUER
        </p>
      </div>

      <Link
        href="/world"
        className="px-8 py-4 bg-[#c8a44e]/10 border-2 border-[#c8a44e]/60 text-[#c8a44e] rounded font-bold tracking-[0.2em] text-sm font-serif hover:bg-[#c8a44e]/20 hover:border-[#c8a44e] transition-all"
      >
        ⚔ ENTER THE MARCHES ⚔
      </Link>
    </div>
  );
}
