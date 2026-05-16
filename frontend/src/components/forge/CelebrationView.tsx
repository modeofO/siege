"use client";

import type { Circuit, CircuitKey, CosmeticType } from "@/lib/forge/circuits";
import type { PlacedComponent } from "@/lib/forge/topology";
import { ForgeChrome, SectionHeader } from "./ForgeChrome";
import { ForgeBoard } from "./ForgeBoard";
import { IlluminatedBanner } from "./IlluminatedBanner";
import { CircuitSchematic } from "./CircuitSchematic";
import { EmberField } from "./EmberField";
import styles from "./forge.module.css";

const EQUIP_LABELS: Record<CosmeticType, string> = {
  banner: "Equip Banner",
  parcelSkin: "Equip Parcel Skin",
  holdDecoration: "Equip Hold Crest",
};

const FORGE_LABELS: Record<CosmeticType, string> = {
  banner: "A BANNER FORGED FROM THE OLD CRAFT",
  parcelSkin: "A PARCEL SKIN INSCRIBED IN AETHER",
  holdDecoration: "A HOLD CREST SHAPED BY THE FORGE",
};

interface CelebrationViewProps {
  circuitKey: CircuitKey;
  circuit: Circuit;
  placedComponents: Record<string, PlacedComponent>;
  onEquip: () => void;
  onGallery: () => void;
  onForgeAgain: () => void;
}

export function CelebrationView({
  circuitKey,
  circuit,
  placedComponents,
  onEquip,
  onGallery,
  onForgeAgain,
}: CelebrationViewProps) {
  return (
    <ForgeChrome>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at 50% 50%, rgba(255,180,80,0.18) 0%, transparent 55%)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      <EmberField count={24} />

      <SectionHeader title="THE GATE OPENS" />

      <div
        style={{
          position: "absolute",
          top: 60,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          zIndex: 3,
          padding: "40px 0",
          overflow: "auto",
        }}
      >
        <div
          className={styles.labelSmAmber}
          style={{ letterSpacing: "0.4em", animation: "shimmer 2s ease-in-out infinite" }}
        >
          ✦ TOPOLOGY COMPLETE ✦
        </div>
        <div
          className={styles.fontSerif}
          style={{
            fontSize: 32,
            color: "oklch(0.78 0.13 75)",
            marginTop: 14,
            letterSpacing: "0.24em",
            textShadow: "0 0 20px rgba(255,180,80,0.5)",
          }}
        >
          {circuit.title.toUpperCase()}
        </div>
        <div style={{ fontSize: 12, color: "#b39e74", letterSpacing: "0.2em", marginTop: 6 }}>
          {FORGE_LABELS[circuit.cosmeticType]}
        </div>

        <div style={{ display: "flex", gap: 60, marginTop: 30, alignItems: "center" }}>
          <ForgeBoard
            circuit={circuit}
            placedComponents={placedComponents}
            isLit={true}
            onDrop={() => {}}
            onRemove={() => {}}
            interactive={false}
          />
          <div style={{ width: 280, animation: "banner-reveal 600ms cubic-bezier(.2,.8,.2,1) both" }}>
            <IlluminatedBanner circuit={circuit} name={circuitKey} />
          </div>
        </div>

        <div
          style={{
            marginTop: 28,
            width: 760,
            background: "rgba(15, 10, 6, 0.85)",
            border: "1px solid oklch(0.78 0.13 75)",
            padding: "20px 28px",
            position: "relative",
            backdropFilter: "blur(4px)",
          }}
        >
          <span className={`${styles.bracket} ${styles.bracketTl}`} style={{ width: 16, height: 16, top: 6, left: 6 }} />
          <span className={`${styles.bracket} ${styles.bracketTr}`} style={{ width: 16, height: 16, top: 6, right: 6 }} />
          <span className={`${styles.bracket} ${styles.bracketBl}`} style={{ width: 16, height: 16, bottom: 6, left: 6 }} />
          <span className={`${styles.bracket} ${styles.bracketBr}`} style={{ width: 16, height: 16, bottom: 6, right: 6 }} />

          <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
            <div style={{ flex: 1 }}>
              <div className={styles.labelSmAmber}>THE OLD-WORLD NAME</div>
              <div
                className={styles.fontSerif}
                style={{ fontSize: 20, color: "#efe3c5", marginTop: 6, letterSpacing: "0.14em" }}
              >
                {circuit.realName}
              </div>
              <div style={{ fontSize: 12, color: "#b39e74", marginTop: 12, lineHeight: 1.6, fontStyle: "italic" }}>
                {circuit.blurb}
              </div>
            </div>
            <div style={{ width: 1, alignSelf: "stretch", background: "rgba(214,193,154,0.12)" }} />
            <div style={{ width: 200 }}>
              <div className={styles.labelSm}>SCHEMATIC</div>
              <div style={{ marginTop: 6, padding: 8, background: "#0a0604", border: "1px solid rgba(214,193,154,0.12)" }}>
                <CircuitSchematic circuitKey={circuitKey} />
              </div>
              <div className={styles.labelSm} style={{ marginTop: 8 }}>CATEGORY</div>
              <div className={styles.fontMono} style={{ fontSize: 11, color: "#b39e74", marginTop: 4 }}>
                {circuit.category}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
          <button className={styles.btnGhostAmber} onClick={onEquip}>{EQUIP_LABELS[circuit.cosmeticType]}</button>
          <button className={styles.btnGhost} onClick={onGallery}>To Gallery</button>
          <button className={styles.btnGhost} onClick={onForgeAgain}>Forge Again</button>
        </div>
      </div>
    </ForgeChrome>
  );
}
