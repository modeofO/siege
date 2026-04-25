"use client";

import type { ReactNode } from "react";
import styles from "./forge.module.css";

interface ForgeChromeProps {
  children: ReactNode;
  width?: number;
  height?: number;
}

export function ForgeChrome({ children, width = 1280, height = 820 }: ForgeChromeProps) {
  return (
    <div
      className={`${styles.forgeBg} ${styles.forgeOverlay}`}
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {children}
      <span className={`${styles.bracket} ${styles.bracketTl}`} />
      <span className={`${styles.bracket} ${styles.bracketTr}`} />
      <span className={`${styles.bracket} ${styles.bracketBl}`} />
      <span className={`${styles.bracket} ${styles.bracketBr}`} />
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  meta?: string;
}

export function SectionHeader({ title, meta }: SectionHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        padding: "20px 32px 16px",
        position: "relative",
        zIndex: 4,
      }}
    >
      <div
        className={styles.fontSerif}
        style={{ color: "oklch(0.78 0.13 75)", fontSize: 16, letterSpacing: "0.28em" }}
      >
        {title}
      </div>
      {meta && (
        <div className={`${styles.fontMono} ${styles.labelSm}`}>{meta}</div>
      )}
    </div>
  );
}
