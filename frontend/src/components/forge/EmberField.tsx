"use client";

import { useMemo } from "react";
import styles from "./forge.module.css";

interface EmberFieldProps {
  count?: number;
}

export function EmberField({ count = 8 }: EmberFieldProps) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        left: 6 + Math.random() * 88,
        bottom: Math.random() * 30,
        delay: Math.random() * 3,
        dur: 2 + Math.random() * 2,
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
