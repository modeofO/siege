"use client";

import type { Circuit, CircuitKey } from "@/lib/forge/circuits";
import { CIRCUITS, CIRCUIT_KEYS } from "@/lib/forge/circuits";
import styles from "./forge.module.css";

interface BlueprintPickerProps {
  activeCircuit: CircuitKey;
  circuit: Circuit;
  isLit: boolean;
  onSelectCircuit: (key: CircuitKey) => void;
}

export function BlueprintPicker({
  activeCircuit,
  circuit,
  isLit,
  onSelectCircuit,
}: BlueprintPickerProps) {
  return (
    <div style={{ width: 220, flexShrink: 0 }}>
      <div className={styles.labelSmAmber} style={{ marginBottom: 12 }}>
        TARGET SILHOUETTE
      </div>
      <div
        style={{
          background: "rgba(0,0,0,0.4)",
          border: "1px solid rgba(214,193,154,0.12)",
          padding: 16,
        }}
      >
        <CircuitSilhouette title={circuit.title} />
        <div
          className={styles.fontMono}
          style={{ fontSize: 10, color: "#6e5c3d", marginTop: 10, lineHeight: 1.5 }}
        >
          {circuit.components.filter((c) => !c.locked).length} crafted parts. The shape is yours to divine.
        </div>
      </div>

      <div className={styles.labelSm} style={{ marginTop: 22, marginBottom: 10 }}>
        REWARD ON COMPLETION
      </div>
      <div
        style={{
          background: "linear-gradient(180deg, #2a1a08, #1a0f08)",
          border: "1px solid rgba(255,180,80,0.3)",
          padding: 14,
        }}
      >
        <div className={styles.fontSerif} style={{ fontSize: 14, color: "#efe3c5" }}>
          {circuit.title}
        </div>
        <div
          style={{
            fontSize: 9,
            color: isLit ? "oklch(0.55 0.09 75)" : "#6e5c3d",
            marginTop: 4,
            letterSpacing: "0.14em",
          }}
        >
          {isLit ? "FORGED — READY TO CLAIM" : "SEALED — UNTIL FORGED"}
        </div>
      </div>

      <div className={styles.labelSm} style={{ marginTop: 22, marginBottom: 10 }}>
        BLUEPRINT
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {CIRCUIT_KEYS.map((k) => {
          const c = CIRCUITS[k];
          const active = k === activeCircuit;
          return (
            <button
              key={k}
              onClick={() => onSelectCircuit(k)}
              style={{
                background: active ? "rgba(255,180,80,0.10)" : "transparent",
                border: `1px solid ${active ? "oklch(0.78 0.13 75)" : "rgba(214,193,154,0.12)"}`,
                color: active ? "oklch(0.78 0.13 75)" : "#b39e74",
                padding: "6px 10px",
                fontFamily: "Cinzel, serif",
                fontSize: 11,
                letterSpacing: "0.14em",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {c.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CircuitSilhouette({ title }: { title: string }) {
  return (
    <svg viewBox="0 0 180 100" width="100%" height="100">
      <defs>
        <radialGradient id="sil-vellum" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#1a0e08" />
          <stop offset="100%" stopColor="#0a0604" />
        </radialGradient>
      </defs>
      <rect width="180" height="100" fill="url(#sil-vellum)" />
      <rect x="8" y="8" width="164" height="84" fill="none" stroke="rgba(255,180,80,0.35)" strokeWidth="0.8" />
      <rect x="11" y="11" width="158" height="78" fill="none" stroke="rgba(255,180,80,0.18)" strokeWidth="0.4" />
      <g transform="translate(90,46)">
        <circle r="20" fill="none" stroke="rgba(255,180,80,0.3)" strokeWidth="0.6" />
        <circle r="16" fill="none" stroke="rgba(255,180,80,0.18)" strokeWidth="0.4" strokeDasharray="2 2" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2;
          const x1 = Math.cos(a) * 20, y1 = Math.sin(a) * 20;
          const x2 = Math.cos(a) * 23, y2 = Math.sin(a) * 23;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,180,80,0.45)" strokeWidth="0.5" />;
        })}
        <text x="0" y="3" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="14" fontWeight="700" fill="rgba(255,180,80,0.55)">
          ?
        </text>
      </g>
      <text x="90" y="82" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="6.5" fontWeight="600" fill="rgba(255,180,80,0.7)" letterSpacing="2">
        {title.toUpperCase()}
      </text>
    </svg>
  );
}
