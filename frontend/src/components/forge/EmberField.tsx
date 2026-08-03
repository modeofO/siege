"use client";

import { useMemo } from "react";
import styles from "./forge.module.css";

interface EmberFieldProps {
  count?: number;
}

// Deterministic scatter — render must be pure, and the server-rendered styles
// must match hydration (Math.random here differed per render and per side).
function scatter(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function EmberField({ count = 8 }: EmberFieldProps) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: 6 + scatter(i, 1) * 88,
        bottom: scatter(i, 2) * 30,
        delay: scatter(i, 3) * 3,
        dur: 2 + scatter(i, 4) * 2,
      })),
    [count],
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {particles.map((p, i) => (
        <span
          key={i}
          className={styles.emberParticle}
          style={{
            left: `${p.left}%`,
            bottom: `${p.bottom}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  );
}
