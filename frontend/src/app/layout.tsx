import type { Metadata } from "next";
import { Geist_Mono, Cinzel } from "next/font/google";
import "./globals.css";
import { StarknetProvider } from "./providers";
import { Navbar } from "@/components/Navbar";
import { BookLink } from "@/components/BookLink";
import { CompassLink } from "@/components/CompassLink";

const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });
const serif = Cinzel({ variable: "--font-serif", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "SIEGE — Trust Your AI",
  description: "A strategic commit-reveal game on Starknet. Team up with your AI agent. Attack or defend. Trust is everything.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${mono.variable} ${serif.variable} font-mono antialiased bg-[#0d0b0a] text-[#d4cfc6] min-h-screen`}>
        <StarknetProvider>
          <Navbar />
          <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
          <CompassLink />
          <BookLink />
        </StarknetProvider>
      </body>
    </html>
  );
}
