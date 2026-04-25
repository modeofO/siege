import type { Circuit, ComponentKind } from "./circuits";

export interface PlacedComponent {
  col: number;
  row: number;
  kind: ComponentKind;
}

export function checkTopology(
  placed: Record<string, PlacedComponent>,
  circuit: Circuit,
): boolean {
  const targets = circuit.components.filter((c) => !c.locked);
  const entries = Object.values(placed);
  if (entries.length !== targets.length) return false;
  return targets.every((target) =>
    entries.some(
      (p) =>
        p.col === target.col && p.row === target.row && p.kind === target.kind,
    ),
  );
}
