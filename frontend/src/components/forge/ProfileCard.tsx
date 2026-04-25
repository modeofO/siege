"use client";

import { CIRCUITS, CIRCUIT_KEYS, type CircuitKey } from "@/lib/forge/circuits";
import { ForgeChrome } from "./ForgeChrome";
import { IlluminatedBanner } from "./IlluminatedBanner";
import { EmberField } from "./EmberField";
import styles from "./forge.module.css";

interface ProfileCardProps {
  equippedCosmetics: {
    banner: CircuitKey | null;
    parcelSkin: CircuitKey | null;
    holdDecoration: CircuitKey | null;
  };
  forgedCircuits: CircuitKey[];
  onChangeBanner: () => void;
  onBack: () => void;
}

export function ProfileCard({
  equippedCosmetics,
  forgedCircuits,
  onChangeBanner,
  onBack,
}: ProfileCardProps) {
  const bannerKey = equippedCosmetics.banner;
  const bannerCircuit = bannerKey ? CIRCUITS[bannerKey] : null;

  return (
    <ForgeChrome width={720} height={540}>
      <EmberField count={6} />

      <div
        style={{
          padding: "20px 32px",
          borderBottom: "1px solid rgba(214,193,154,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div className={styles.fontSerif} style={{ color: "oklch(0.78 0.13 75)", fontSize: 14, letterSpacing: "0.28em" }}>
          WARLORD&apos;S CARD
        </div>
        <div className={`${styles.fontMono} ${styles.labelSm}`}>public profile · v3</div>
      </div>

      <div style={{ padding: 32, display: "flex", gap: 28, position: "relative", zIndex: 2 }}>
        <div>
          {bannerCircuit && bannerKey ? (
            <IlluminatedBanner scale={0.85} name={bannerKey} circuit={bannerCircuit} />
          ) : (
            <div
              style={{
                width: 238,
                height: 306,
                background: "rgba(0,0,0,0.3)",
                border: "1px dashed rgba(214,193,154,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#6e5c3d",
                fontSize: 12,
                letterSpacing: "0.14em",
              }}
            >
              NO BANNER EQUIPPED
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div className={styles.labelSmAmber}>WARLORD</div>
          <div className={styles.fontSerif} style={{ fontSize: 24, color: "#efe3c5", marginTop: 6, letterSpacing: "0.16em" }}>
            MODUS, OF THE MARCHES
          </div>
          <div className={styles.fontMono} style={{ fontSize: 11, color: "#6e5c3d", marginTop: 6 }}>
            0x0502_13a0 · joined wk.124
          </div>

          <div style={{ marginTop: 20, padding: "14px 0", borderTop: "1px solid rgba(214,193,154,0.12)", borderBottom: "1px solid rgba(214,193,154,0.12)" }}>
            <div className={styles.labelSm}>EQUIPPED BANNER</div>
            <div style={{ marginTop: 6 }}>
              {bannerCircuit ? (
                <>
                  <div className={styles.fontSerif} style={{ fontSize: 16, color: "oklch(0.78 0.13 75)" }}>
                    {bannerCircuit.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#b39e74", marginTop: 4, fontStyle: "italic" }}>
                    {bannerCircuit.realName} · forged
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: "#6e5c3d" }}>None equipped</div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18 }}>
            <div>
              <div className={styles.labelSm}>CIRCUITS FORGED</div>
              <div className={styles.fontMono} style={{ fontSize: 22, color: "oklch(0.78 0.13 75)", marginTop: 4 }}>
                {forgedCircuits.length} / {CIRCUIT_KEYS.length}
              </div>
            </div>
            <div>
              <div className={styles.labelSm}>HOLD STANDING</div>
              <div className={styles.fontMono} style={{ fontSize: 13, color: "#b39e74", marginTop: 4 }}>
                BANNERMAN · TIER II
              </div>
            </div>
          </div>

          <div style={{ marginTop: "auto", display: "flex", gap: 8, paddingTop: 16 }}>
            <button className={styles.btnGhostAmber} style={{ flex: 1 }} onClick={onChangeBanner}>
              Change Banner
            </button>
            <button className={styles.btnGhost} onClick={onBack}>
              Back
            </button>
          </div>
        </div>
      </div>
    </ForgeChrome>
  );
}
