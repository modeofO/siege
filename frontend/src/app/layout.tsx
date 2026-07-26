import type { Metadata } from "next";
import { Geist_Mono, Cinzel, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { StarknetProvider } from "./providers";
import { Navbar } from "@/components/Navbar";
import { BookLink } from "@/components/BookLink";
import { CompassLink } from "@/components/CompassLink";
import { AskToriiChat } from "@/components/AskToriiChat";
import { TestNetworkBanner } from "@/components/TestNetworkBanner";
import { BUILD_NETWORK } from "@/lib/network";

const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });
const serif = Cinzel({ variable: "--font-serif", subsets: ["latin"], weight: ["400", "700"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Siege",
  description:
    "A strategic commit-reveal game on Starknet. Team up with your AI agent. Attack or defend. Trust is everything.",
  icons: {
    icon: "/sprites/abilities/siege-sword.svg",
    shortcut: "/sprites/abilities/siege-sword.svg",
    apple: "/sprites/abilities/siege-sword.svg",
  },
  // Keep the practice deployment out of search results so it cannot compete
  // with the real game — landing on a wiped, no-stakes sandbox from a search
  // for "siege" would read as the game being broken.
  //
  // Keyed to BUILD_NETWORK, not the active network: this is a property of the
  // deployment, and metadata is evaluated server-side where a player's runtime
  // override does not exist. Using the resolved network would let someone
  // toggling to Practice mark the production site noindex.
  ...(BUILD_NETWORK === "mainnet" ? {} : { robots: { index: false, follow: false } }),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${mono.variable} ${serif.variable} ${jetbrains.variable} font-mono antialiased bg-[#0d0b0a] text-[#d4cfc6] min-h-screen`}
      >
        <StarknetProvider>
          <TestNetworkBanner />
          <Navbar />
          <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
          <CompassLink />
          <BookLink />
          <AskToriiChat />
        </StarknetProvider>
      </body>
    </html>
  );
}
