// Art-direction variants for the war table (design handoff options 1a / 1b).
// Same geometry and data bindings; only palette, lighting, and overlays differ.
//   warm — Candlelit Keep: warm chiaroscuro, inked parchment map, ember drift.
//   holo — Arcane Holo Table: cool tactical hologram, glowing teal map grid.
// Values come from the design prototype's per-variant build() parameters.

import { PALETTE } from "./layout";

export type BattlefieldVariant = "warm" | "holo";

export interface VariantTokens {
  fogColor: string;
  fogDensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  candleColor: string;
  candleIntensity: number;
  coreEmissive: string;
  haloColor: string;
  haloOpacity: number;
  shaftColor: string;
  fillColor: string;
  fillIntensity: number;
  rimColor: string;
  rimIntensity: number;
  envIntensity: number;
  exposure: number;
  bloom: [strength: number, radius: number, threshold: number];
  windowEmissive: string;
  windowIntensity: number;
  dustColor: string;
  emberColor: string;
  bannerEmissive: number;
  // Holo tints the (un-inked) paper; warm leaves the inked map untinted.
  parchmentTint: string;
  parchmentInk: boolean;
}

export const VARIANT_TOKENS: Record<BattlefieldVariant, VariantTokens> = {
  warm: {
    fogColor: "#140d07",
    fogDensity: 0.052,
    hemiSky: "#4a3820",
    hemiGround: "#140d06",
    hemiIntensity: 0.55,
    candleColor: PALETTE.candle,
    candleIntensity: 3.4,
    coreEmissive: "#ffbe6a",
    haloColor: PALETTE.candle,
    haloOpacity: 0.55,
    shaftColor: PALETTE.candle,
    fillColor: "#6b8cae",
    fillIntensity: 0.38,
    rimColor: "#ffab55",
    rimIntensity: 0.5,
    envIntensity: 0.35,
    exposure: 1.02,
    bloom: [0.7, 0.5, 0.84],
    windowEmissive: "#ffb257",
    windowIntensity: 2.4,
    dustColor: PALETTE.candle,
    emberColor: "#ff9a3c",
    bannerEmissive: 0.05,
    parchmentTint: "#ffffff",
    parchmentInk: true,
  },
  holo: {
    fogColor: "#08110f",
    fogDensity: 0.05,
    hemiSky: "#123038",
    hemiGround: "#081010",
    hemiIntensity: 0.6,
    candleColor: "#bfe4ea",
    candleIntensity: 1.7,
    coreEmissive: "#ffd0a0",
    haloColor: "#8fd6e0",
    haloOpacity: 0.4,
    shaftColor: "#ffcf94",
    fillColor: PALETTE.holo,
    fillIntensity: 0.95,
    rimColor: "#5fe3f0",
    rimIntensity: 1.15,
    envIntensity: 0.38,
    exposure: 0.98,
    bloom: [0.72, 0.55, 0.8],
    windowEmissive: "#ffd18a",
    windowIntensity: 2.0,
    dustColor: "#9fe6ee",
    emberColor: "#7fe4ee",
    bannerEmissive: 0.12,
    parchmentTint: "#4a6167",
    parchmentInk: false,
  },
};
