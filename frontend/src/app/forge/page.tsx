"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useAccount } from "@/app/providers";
import { useForgeState } from "@/lib/forge/forgeState";
import { CIRCUITS, type CosmeticType } from "@/lib/forge/circuits";
import { ForgeChrome, SectionHeader } from "@/components/forge/ForgeChrome";
import { ForgeBoard } from "@/components/forge/ForgeBoard";
import { ComponentTray } from "@/components/forge/ComponentTray";
import { BlueprintPicker } from "@/components/forge/BlueprintPicker";
import { CelebrationView } from "@/components/forge/CelebrationView";
import { GalleryView } from "@/components/forge/GalleryView";
import { ProfileCard } from "@/components/forge/ProfileCard";
import { EmberField } from "@/components/forge/EmberField";
import styles from "@/components/forge/forge.module.css";

export default function ForgePage() {
  const { account } = useAccount();
  const state = useForgeState(account ?? undefined);
  const [lastEquippedSlot, setLastEquippedSlot] = useState<CosmeticType | undefined>();

  const handleEquip = useCallback(async () => {
    const slot = CIRCUITS[state.activeCircuit].cosmeticType;
    setLastEquippedSlot(slot);
    await state.equipCosmetic(state.activeCircuit);
    state.setView("profile");
  }, [state]);

  if (state.currentView === "celebration") {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 20 }}>
        <CelebrationView
          circuitKey={state.activeCircuit}
          circuit={state.circuit}
          placedComponents={state.placedComponents}
          onEquip={handleEquip}
          onGallery={() => state.setView("gallery")}
          onForgeAgain={() => state.selectCircuit(state.activeCircuit)}
        />
      </div>
    );
  }

  if (state.currentView === "gallery") {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 20 }}>
        <GalleryView
          forgedCircuits={state.forgedCircuits}
          equippedCosmetics={state.equippedCosmetics}
          onEquip={(key) => state.equipCosmetic(key)}
          onUnequip={(type) => state.unequipCosmetic(type)}
          onBack={() => state.setView("forge")}
        />
      </div>
    );
  }

  if (state.currentView === "profile") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 20, gap: 8 }}>
        {state.equipError && (
          <div style={{ color: "#c44332", fontSize: 11, letterSpacing: "0.06em", maxWidth: 600, textAlign: "center" }}>
            Equip failed: {state.equipError}
          </div>
        )}
        <ProfileCard
          equippedCosmetics={state.equippedCosmetics}
          forgedCircuits={state.forgedCircuits}
          onChangeBanner={() => state.setView("gallery")}
          onBack={() => state.setView("forge")}
          highlightSlot={lastEquippedSlot}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: 20 }}>
      <ForgeChrome>
        <SectionHeader title="THE CIRCUIT FORGE" meta={`bench · ${state.forgedCircuits.length} / 7`} />

        <div style={{ display: "flex", gap: 20, padding: "0 32px", position: "relative", zIndex: 3 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <ComponentTray inventory={state.inventory} />
            {Object.values(state.inventory).every((v) => v === 0) && (
              <Link
                href="/craft"
                className={styles.btnGhost}
                style={{ fontSize: 10, textAlign: "center", display: "block" }}
              >
                Craft Parts →
              </Link>
            )}
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
            <div style={{ position: "relative", padding: 20 }}>
              <span className={styles.lantern} style={{ left: 0, top: 0 }} />
              <span className={styles.lantern} style={{ right: 0, top: 0 }} />
              <span className={styles.lantern} style={{ left: 0, bottom: 0 }} />
              <span className={styles.lantern} style={{ right: 0, bottom: 0 }} />
              <ForgeBoard
                circuit={state.circuit}
                placedComponents={state.placedComponents}
                isLit={state.isLit}
                onDrop={state.placeComponent}
                onRemove={state.removeComponent}
              />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                maxWidth: 530,
                padding: "14px 4px",
                borderTop: "1px solid rgba(214,193,154,0.12)",
                marginTop: 8,
              }}
            >
              <div>
                <div className={styles.labelSm}>PATTERN MATCH</div>
                <div
                  className={styles.fontMono}
                  style={{
                    fontSize: 13,
                    color: state.isLit ? "oklch(0.78 0.13 75)" : "#b39e74",
                    marginTop: 4,
                    letterSpacing: "0.06em",
                  }}
                >
                  {state.isLit
                    ? `${state.circuit.components.filter((c) => !c.locked).length} / ${state.circuit.components.filter((c) => !c.locked).length} conduits aligned`
                    : `${Object.keys(state.placedComponents).length} / ${state.circuit.components.filter((c) => !c.locked).length} conduits aligned`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className={styles.btnGhost} onClick={() => state.setView("gallery")}>
                  Gallery
                </button>
                <button className={styles.btnGhost} onClick={() => state.setView("profile")}>
                  Profile
                </button>
                <button
                  className={styles.btnGhostAmber}
                  onClick={() => state.isLit && state.confirmForge()}
                  style={{
                    opacity: state.isLit ? 1 : 0.4,
                    cursor: state.isLit ? "pointer" : "not-allowed",
                    boxShadow: state.isLit ? "0 0 20px rgba(255,180,80,0.3)" : "none",
                  }}
                >
                  {state.isLit ? "◉ Aether Flowing" : "◯ Run Aether"}
                </button>
              </div>
            </div>
          </div>

          <BlueprintPicker
            activeCircuit={state.activeCircuit}
            circuit={state.circuit}
            isLit={state.isLit}
            onSelectCircuit={state.selectCircuit}
          />
        </div>

        {state.isLit && <EmberField count={14} />}
      </ForgeChrome>
    </div>
  );
}
