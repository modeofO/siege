import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-12">
      {/* Hero */}
      <div className="text-center space-y-4">
        <h1 className="text-5xl md:text-7xl font-bold tracking-[0.3em] text-[#c8a44e] font-serif">
          SIEGE
        </h1>
        <p className="text-xl text-[#7a7060] tracking-wider">
          Trust Your AI
        </p>
      </div>

      {/* Explanation */}
      <div className="max-w-lg text-center text-sm text-[#7a7060] leading-relaxed space-y-3">
        <p>
          Allocate resources across pressure points. Commit your moves with cryptographic hashes.
          Reveal simultaneously. Outsmart, outplay, outlast.
        </p>
      </div>

      {/* Mode selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl w-full">
        {/* 1v1 Mode */}
        <div className="border border-[#c8a44e]/30 rounded-lg p-6 bg-[#1a1714] space-y-4">
          <div className="text-lg font-bold text-[#c8a44e] tracking-wider font-serif">1v1 MODE</div>
          <p className="text-xs text-[#7a7060]">
            One player controls attack + defense. Shared budget. Fast rounds.
          </p>
          <div className="flex gap-3">
            <Link
              href="/match-1v1/create"
              className="flex-1 text-center px-4 py-2 bg-[#c8a44e]/10 border border-[#c8a44e]/40 text-[#c8a44e] rounded hover:bg-[#c8a44e]/20 transition-colors text-sm"
            >
              CREATE
            </Link>
            <Link
              href="/match-1v1/join"
              className="flex-1 text-center px-4 py-2 bg-[#1a1714] border border-[#3d3428] rounded hover:border-[#c8a44e] hover:text-[#c8a44e] transition-colors text-sm"
            >
              JOIN
            </Link>
          </div>
        </div>

        {/* 2v2 Mode */}
        <div className="border border-[#6b8cae]/30 rounded-lg p-6 bg-[#1a1714] space-y-4">
          <div className="text-lg font-bold text-[#6b8cae] tracking-wider font-serif">2v2 MODE</div>
          <p className="text-xs text-[#7a7060]">
            Two teams of two. Human + AI. One attacks, one defends.
          </p>
          <div className="flex gap-3">
            <Link
              href="/match/create"
              className="flex-1 text-center px-4 py-2 bg-[#6b8cae]/10 border border-[#6b8cae]/40 text-[#6b8cae] rounded hover:bg-[#6b8cae]/20 transition-colors text-sm"
            >
              CREATE
            </Link>
            <Link
              href="/match/join"
              className="flex-1 text-center px-4 py-2 bg-[#1a1714] border border-[#3d3428] rounded hover:border-[#6b8cae] hover:text-[#6b8cae] transition-colors text-sm"
            >
              JOIN
            </Link>
          </div>
        </div>
      </div>

      <div className="text-[#3d3428] text-xs tracking-[0.5em] mt-4">
        ▪ COMMIT ▪ REVEAL ▪ CONQUER ▪
      </div>
    </div>
  );
}
