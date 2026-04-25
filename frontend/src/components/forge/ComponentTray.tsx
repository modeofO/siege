"use client";

import { useCallback } from "react";
import type { ComponentKind } from "@/lib/forge/circuits";
import { COMPONENT_NAMES, COMPONENT_FANTASY } from "@/lib/forge/circuits";
import { RuneIcon } from "./RuneIcon";
import styles from "./forge.module.css";

const TRAY_KINDS: ComponentKind[] = [
  "rune-stone",
  "flux-well",
  "spiral-coil",
  "one-way-valve",
];

interface ComponentTrayProps {
  inventory: Record<ComponentKind, number>;
}

let dragCounter = 0;

export function ComponentTray({ inventory }: ComponentTrayProps) {
  const handleDragStart = useCallback(
    (e: React.DragEvent, kind: ComponentKind) => {
      if (inventory[kind] <= 0) {
        e.preventDefault();
        return;
      }
      const instanceId = `${kind}-${++dragCounter}`;
      e.dataTransfer.setData("forge/kind", kind);
      e.dataTransfer.setData("forge/instanceId", instanceId);
      e.dataTransfer.effectAllowed = "move";
    },
    [inventory],
  );

  return (
    <div style={{ width: 240, flexShrink: 0 }}>
      <div className={styles.labelSmAmber} style={{ marginBottom: 12 }}>
        COMPONENT TRAY
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {TRAY_KINDS.map((kind) => (
          <div
            key={kind}
            draggable={inventory[kind] > 0}
            onDragStart={(e) => handleDragStart(e, kind)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 10,
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(214,193,154,0.12)",
              borderRadius: 2,
              cursor: inventory[kind] > 0 ? "grab" : "not-allowed",
              opacity: inventory[kind] > 0 ? 1 : 0.4,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                background: "#1a0f08",
                border: "1px solid rgba(255,180,80,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <RuneIcon kind={kind} size={22} color="oklch(0.78 0.13 75)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "#efe3c5", letterSpacing: "0.04em" }}>
                {COMPONENT_NAMES[kind]}
              </div>
              <div style={{ fontSize: 10, color: "#6e5c3d", marginTop: 2 }}>
                {COMPONENT_FANTASY[kind]}
              </div>
            </div>
            <div
              className={styles.fontMono}
              style={{
                fontSize: 11,
                color: "oklch(0.78 0.13 75)",
                borderLeft: "1px solid rgba(214,193,154,0.12)",
                paddingLeft: 10,
                alignSelf: "stretch",
                display: "flex",
                alignItems: "center",
              }}
            >
              ×{inventory[kind]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
