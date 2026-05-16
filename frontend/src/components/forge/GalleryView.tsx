"use client";

import { useState } from "react";
import { CIRCUITS, CIRCUIT_KEYS, type CircuitKey, type CosmeticType } from "@/lib/forge/circuits";
import { ForgeChrome, SectionHeader } from "./ForgeChrome";
import { IlluminatedBanner } from "./IlluminatedBanner";
import styles from "./forge.module.css";

type TabFilter = "all" | CosmeticType;

const TABS: { label: string; filter: TabFilter }[] = [
  { label: "ALL", filter: "all" },
  { label: "BANNERS", filter: "banner" },
  { label: "PARCEL SKINS", filter: "parcelSkin" },
  { label: "HOLD CRESTS", filter: "holdDecoration" },
];

interface GalleryViewProps {
  forgedCircuits: CircuitKey[];
  equippedCosmetics: {
    banner: CircuitKey | null;
    parcelSkin: CircuitKey | null;
    holdDecoration: CircuitKey | null;
  };
  onEquip: (key: CircuitKey) => void;
  onUnequip: (type: CosmeticType) => void;
  onBack: () => void;
}

export function GalleryView({
  forgedCircuits,
  equippedCosmetics,
  onEquip,
  onUnequip,
  onBack,
}: GalleryViewProps) {
  const [activeTab, setActiveTab] = useState<TabFilter>("all");

  const items = CIRCUIT_KEYS.filter(
    (k) => activeTab === "all" || CIRCUITS[k].cosmeticType === activeTab,
  );

  const forgedCount = forgedCircuits.length;

  function isEquipped(key: CircuitKey): boolean {
    const type = CIRCUITS[key].cosmeticType;
    return equippedCosmetics[type] === key;
  }

  return (
    <ForgeChrome>
      <SectionHeader
        title="THE COSMETIC RELIQUARY"
        meta={`${forgedCount} / ${CIRCUIT_KEYS.length} forged`}
      />

      <div
        style={{
          display: "flex",
          gap: 24,
          padding: "0 32px 16px",
          borderBottom: "1px solid rgba(214,193,154,0.12)",
        }}
      >
        {TABS.map(({ label, filter }) => {
          const count = filter === "all"
            ? CIRCUIT_KEYS.length
            : CIRCUIT_KEYS.filter((k) => CIRCUITS[k].cosmeticType === filter).length;
          const active = activeTab === filter;
          return (
            <button
              key={filter}
              onClick={() => setActiveTab(filter)}
              style={{
                paddingBottom: 10,
                background: "none",
                border: "none",
                borderBottom: `2px solid ${active ? "oklch(0.78 0.13 75)" : "transparent"}`,
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <span
                className={styles.labelSm}
                style={{ color: active ? "oklch(0.78 0.13 75)" : "#6e5c3d" }}
              >
                {label}
              </span>
              <span className={styles.fontMono} style={{ fontSize: 10, color: "#6e5c3d" }}>
                {count}
              </span>
            </button>
          );
        })}
        <button
          className={styles.btnGhost}
          onClick={onBack}
          style={{ marginLeft: "auto", padding: "4px 12px" }}
        >
          Back to Forge
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 24,
          padding: "28px 32px",
          position: "relative",
          zIndex: 3,
        }}
      >
        {items.map((key) => {
          const c = CIRCUITS[key];
          const unlocked = forgedCircuits.includes(key);
          const equipped = isEquipped(key);
          return (
            <div
              key={key}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                padding: 8,
                border: equipped ? "1px solid oklch(0.78 0.13 75)" : "1px solid transparent",
                background: equipped ? "rgba(255,180,80,0.06)" : undefined,
              }}
            >
              <IlluminatedBanner locked={!unlocked} name={key} circuit={c} scale={0.62} />
              <div style={{ textAlign: "center", marginTop: 6 }}>
                <div className={styles.labelSmAmber} style={{ fontSize: 9 }}>
                  {c.cosmeticType === "banner" ? "BANNER" : c.cosmeticType === "parcelSkin" ? "PARCEL SKIN" : "HOLD CREST"}
                </div>
                <div
                  className={styles.fontSerif}
                  style={{
                    fontSize: 14,
                    color: unlocked ? "#efe3c5" : "#6e5c3d",
                    marginTop: 4,
                    letterSpacing: "0.14em",
                  }}
                >
                  {c.title}
                </div>
                <div className={styles.fontMono} style={{ fontSize: 10, color: "#6e5c3d", marginTop: 4, letterSpacing: "0.08em" }}>
                  {unlocked ? c.realName : "???"}
                </div>
              </div>
              {unlocked && (
                equipped ? (
                  <button
                    className={styles.btnGhostAmber}
                    style={{ fontSize: 9, padding: "4px 14px" }}
                    onClick={() => onUnequip(c.cosmeticType)}
                  >
                    EQUIPPED
                  </button>
                ) : (
                  <button
                    className={styles.btnGhost}
                    style={{ fontSize: 9, padding: "4px 14px" }}
                    onClick={() => onEquip(key)}
                  >
                    EQUIP
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>
    </ForgeChrome>
  );
}
