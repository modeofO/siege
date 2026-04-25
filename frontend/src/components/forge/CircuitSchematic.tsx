"use client";

import type { CircuitKey } from "@/lib/forge/circuits";

interface CircuitSchematicProps {
  circuitKey: CircuitKey;
}

const STROKE = "oklch(0.78 0.13 75)";
const SW = 1;
const LABEL: React.SVGAttributes<SVGTextElement> = {
  fill: "#6e5c3d",
  fontSize: 6.5,
  fontFamily: '"JetBrains Mono", monospace',
};

function Wire({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={STROKE} strokeWidth={SW} />;
}

function Ground({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y + 6} stroke={STROKE} strokeWidth={SW} />
      <line x1={x - 5} y1={y + 6} x2={x + 5} y2={y + 6} stroke={STROKE} strokeWidth={SW} />
      <line x1={x - 3} y1={y + 9} x2={x + 3} y2={y + 9} stroke={STROKE} strokeWidth={SW} />
      <line x1={x - 1.5} y1={y + 12} x2={x + 1.5} y2={y + 12} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

function Resistor({ x, y, label, horizontal = true }: { x: number; y: number; label: string; horizontal?: boolean }) {
  return (
    <g>
      {horizontal ? (
        <path d={`M${x - 10} ${y} l3 -4 l4 8 l4 -8 l4 8 l4 -8 l3 4`} fill="none" stroke={STROKE} strokeWidth={SW} />
      ) : (
        <path d={`M${x} ${y - 10} l-4 3 l8 4 l-8 4 l8 4 l-8 4 l4 3`} fill="none" stroke={STROKE} strokeWidth={SW} />
      )}
      <text x={x + (horizontal ? 0 : 10)} y={y + (horizontal ? -8 : 0)} textAnchor="middle" {...LABEL}>{label}</text>
    </g>
  );
}

function Capacitor({ x, y, label, vertical = true }: { x: number; y: number; label: string; vertical?: boolean }) {
  return (
    <g>
      {vertical ? (
        <>
          <line x1={x - 6} y1={y - 2} x2={x + 6} y2={y - 2} stroke={STROKE} strokeWidth={SW + 0.4} />
          <line x1={x - 6} y1={y + 2} x2={x + 6} y2={y + 2} stroke={STROKE} strokeWidth={SW + 0.4} />
        </>
      ) : (
        <>
          <line x1={x - 2} y1={y - 6} x2={x - 2} y2={y + 6} stroke={STROKE} strokeWidth={SW + 0.4} />
          <line x1={x + 2} y1={y - 6} x2={x + 2} y2={y + 6} stroke={STROKE} strokeWidth={SW + 0.4} />
        </>
      )}
      <text x={x + (vertical ? 10 : 0)} y={y + (vertical ? 1 : -8)} textAnchor="middle" {...LABEL}>{label}</text>
    </g>
  );
}

function Inductor({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g>
      <path d={`M${x - 12} ${y} q3 -6 6 0 q3 -6 6 0 q3 -6 6 0 q3 -6 6 0`} fill="none" stroke={STROKE} strokeWidth={SW} />
      <text x={x} y={y - 8} textAnchor="middle" {...LABEL}>{label}</text>
    </g>
  );
}

function Diode({ x, y, label, horizontal = true }: { x: number; y: number; label: string; horizontal?: boolean }) {
  return (
    <g>
      {horizontal ? (
        <>
          <polygon points={`${x - 5},${y - 4} ${x + 4},${y} ${x - 5},${y + 4}`} fill="none" stroke={STROKE} strokeWidth={SW} />
          <line x1={x + 4} y1={y - 4} x2={x + 4} y2={y + 4} stroke={STROKE} strokeWidth={SW} />
        </>
      ) : (
        <>
          <polygon points={`${x - 4},${y - 5} ${x},${y + 4} ${x + 4},${y - 5}`} fill="none" stroke={STROKE} strokeWidth={SW} />
          <line x1={x - 4} y1={y + 4} x2={x + 4} y2={y + 4} stroke={STROKE} strokeWidth={SW} />
        </>
      )}
      <text x={x + (horizontal ? 0 : 10)} y={y + (horizontal ? -8 : 0)} textAnchor="middle" {...LABEL}>{label}</text>
    </g>
  );
}

function Source({ x, y, label = "Vin" }: { x: number; y: number; label?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r="6" fill="none" stroke={STROKE} strokeWidth={SW} />
      <text x={x} y={y + 2} textAnchor="middle" {...LABEL} style={{ fontSize: 7 }}>~</text>
      <text x={x - 10} y={y + 1} textAnchor="end" {...LABEL}>{label}</text>
    </g>
  );
}

function Dot({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r="1.4" fill={STROKE} />;
}

function Out({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="1.8" fill="none" stroke={STROKE} strokeWidth={SW} />
      <text x={x + 5} y={y + 2} {...LABEL}>Vout</text>
    </g>
  );
}

export function CircuitSchematic({ circuitKey }: CircuitSchematicProps) {
  return (
    <svg viewBox="0 0 200 90" width="100%" height="80">
      <SchematicParts circuitKey={circuitKey} />
    </svg>
  );
}

function SchematicParts({ circuitKey }: { circuitKey: CircuitKey }) {
  switch (circuitKey) {
    case "half-wave-rectifier":
      return (
        <>
          <Source x={15} y={45} />
          <Wire x1={21} y1={45} x2={50} y2={45} />
          <Diode x={56} y={45} label="D1" />
          <Wire x1={60} y1={45} x2={100} y2={45} />
          <Resistor x={110} y={45} label="R" />
          <Wire x1={120} y1={45} x2={160} y2={45} />
          <Capacitor x={140} y={60} label="C" vertical={false} />
          <Wire x1={140} y1={45} x2={140} y2={54} />
          <Dot x={140} y={45} />
          <Wire x1={140} y1={66} x2={140} y2={75} />
          <Wire x1={15} y1={51} x2={15} y2={75} />
          <Wire x1={15} y1={75} x2={160} y2={75} />
          <Out x={160} y={45} />
          <Ground x={85} y={75} />
        </>
      );
    case "voltage-divider":
      return (
        <>
          <Source x={15} y={35} />
          <Wire x1={21} y1={35} x2={60} y2={35} />
          <Resistor x={70} y={35} label="R1" />
          <Wire x1={80} y1={35} x2={130} y2={35} />
          <Resistor x={140} y={35} label="R2" />
          <Wire x1={150} y1={35} x2={175} y2={35} />
          <Wire x1={15} y1={41} x2={15} y2={75} />
          <Wire x1={15} y1={75} x2={175} y2={75} />
          <Wire x1={175} y1={35} x2={175} y2={75} />
          <Dot x={105} y={35} />
          <Wire x1={105} y1={35} x2={105} y2={25} />
          <Out x={105} y={22} />
          <Ground x={95} y={75} />
        </>
      );
    case "full-wave-rectifier":
      return (
        <>
          <Source x={15} y={45} />
          <Wire x1={21} y1={45} x2={35} y2={45} />
          <Wire x1={35} y1={45} x2={35} y2={25} />
          <Wire x1={35} y1={45} x2={35} y2={65} />
          <Diode x={50} y={25} label="D1" />
          <Diode x={80} y={25} label="D2" />
          <Diode x={50} y={65} label="D3" />
          <Diode x={80} y={65} label="D4" />
          <Wire x1={35} y1={25} x2={45} y2={25} />
          <Wire x1={54} y1={25} x2={75} y2={25} />
          <Wire x1={84} y1={25} x2={95} y2={25} />
          <Wire x1={35} y1={65} x2={45} y2={65} />
          <Wire x1={54} y1={65} x2={75} y2={65} />
          <Wire x1={84} y1={65} x2={95} y2={65} />
          <Wire x1={95} y1={25} x2={95} y2={45} />
          <Wire x1={95} y1={65} x2={95} y2={45} />
          <Dot x={95} y={45} />
          <Wire x1={95} y1={45} x2={130} y2={45} />
          <Resistor x={140} y={45} label="R" />
          <Wire x1={150} y1={45} x2={175} y2={45} />
          <Out x={178} y={45} />
          <Wire x1={15} y1={51} x2={15} y2={90} />
          <Wire x1={15} y1={90} x2={175} y2={90} />
          <Wire x1={175} y1={45} x2={175} y2={90} />
          <Ground x={95} y={90} />
        </>
      );
    case "rc-low-pass":
      return (
        <>
          <Source x={15} y={35} />
          <Wire x1={21} y1={35} x2={70} y2={35} />
          <Resistor x={80} y={35} label="R" />
          <Wire x1={90} y1={35} x2={175} y2={35} />
          <Capacitor x={135} y={50} label="C" vertical={false} />
          <Wire x1={135} y1={35} x2={135} y2={44} />
          <Dot x={135} y={35} />
          <Wire x1={135} y1={56} x2={135} y2={75} />
          <Wire x1={15} y1={41} x2={15} y2={75} />
          <Wire x1={15} y1={75} x2={175} y2={75} />
          <Wire x1={175} y1={35} x2={175} y2={75} />
          <Out x={165} y={25} />
          <Wire x1={155} y1={35} x2={155} y2={25} />
          <Wire x1={155} y1={25} x2={165} y2={25} />
          <Dot x={155} y={35} />
          <Ground x={95} y={75} />
        </>
      );
    case "lc-tank":
      return (
        <>
          <Source x={15} y={50} />
          <Wire x1={21} y1={50} x2={50} y2={50} />
          <Wire x1={50} y1={50} x2={50} y2={30} />
          <Wire x1={50} y1={50} x2={50} y2={70} />
          <Wire x1={50} y1={30} x2={90} y2={30} />
          <Wire x1={50} y1={70} x2={90} y2={70} />
          <Inductor x={70} y={30} label="L" />
          <Capacitor x={70} y={70} label="C" />
          <Wire x1={90} y1={30} x2={90} y2={50} />
          <Wire x1={90} y1={70} x2={90} y2={50} />
          <Dot x={90} y={50} />
          <Wire x1={90} y1={50} x2={175} y2={50} />
          <Out x={178} y={50} />
          <Wire x1={15} y1={56} x2={15} y2={90} />
          <Wire x1={15} y1={90} x2={175} y2={90} />
          <Wire x1={175} y1={50} x2={175} y2={90} />
          <Ground x={95} y={90} />
        </>
      );
    case "buck-converter":
      return (
        <>
          <Source x={15} y={30} label="Vin" />
          <Wire x1={21} y1={30} x2={40} y2={30} />
          <g>
            <line x1={40} y1={30} x2={50} y2={22} stroke={STROKE} strokeWidth={SW} />
            <circle cx={40} cy={30} r="1.4" fill={STROKE} />
            <circle cx={52} cy={30} r="1.4" fill={STROKE} />
            <text x={46} y={14} textAnchor="middle" {...LABEL}>SW</text>
          </g>
          <Wire x1={52} y1={30} x2={75} y2={30} />
          <Inductor x={90} y={30} label="L" />
          <Wire x1={105} y1={30} x2={175} y2={30} />
          <Wire x1={75} y1={30} x2={75} y2={50} />
          <Diode x={75} y={60} label="D" horizontal={false} />
          <Wire x1={75} y1={65} x2={75} y2={80} />
          <Capacitor x={140} y={50} label="C" vertical={false} />
          <Wire x1={140} y1={30} x2={140} y2={44} />
          <Dot x={140} y={30} />
          <Wire x1={140} y1={56} x2={140} y2={80} />
          <Wire x1={15} y1={36} x2={15} y2={80} />
          <Wire x1={15} y1={80} x2={175} y2={80} />
          <Wire x1={175} y1={30} x2={175} y2={80} />
          <Out x={178} y={30} />
          <Ground x={95} y={80} />
        </>
      );
    case "common-emitter-amp":
      return (
        <>
          <text x={100} y={10} textAnchor="middle" {...LABEL}>+Vcc</text>
          <Wire x1={20} y1={14} x2={180} y2={14} />
          <Resistor x={50} y={30} label="R1" horizontal={false} />
          <Wire x1={50} y1={14} x2={50} y2={20} />
          <Wire x1={50} y1={40} x2={50} y2={50} />
          <Resistor x={120} y={30} label="Rc" horizontal={false} />
          <Wire x1={120} y1={14} x2={120} y2={20} />
          <Wire x1={120} y1={40} x2={120} y2={50} />
          <Capacitor x={25} y={50} label="Cin" />
          <Wire x1={15} y1={50} x2={19} y2={50} />
          <Wire x1={31} y1={50} x2={50} y2={50} />
          <Dot x={50} y={50} />
          <Resistor x={50} y={70} label="R2" horizontal={false} />
          <Wire x1={50} y1={60} x2={50} y2={65} />
          <Wire x1={50} y1={75} x2={50} y2={85} />
          <g>
            <circle cx={85} cy={50} r="9" fill="none" stroke={STROKE} strokeWidth={SW} />
            <line x1={50} y1={50} x2={76} y2={50} stroke={STROKE} strokeWidth={SW} />
            <line x1={78} y1={44} x2={78} y2={56} stroke={STROKE} strokeWidth={SW + 0.4} />
            <line x1={78} y1={46} x2={92} y2={38} stroke={STROKE} strokeWidth={SW} />
            <line x1={78} y1={54} x2={92} y2={62} stroke={STROKE} strokeWidth={SW} />
            <polygon points="88,60 92,62 87,64" fill={STROKE} />
            <text x={100} y={56} {...LABEL}>Q1</text>
          </g>
          <Wire x1={92} y1={38} x2={120} y2={38} />
          <Wire x1={120} y1={38} x2={120} y2={40} />
          <Dot x={120} y={50} />
          <Wire x1={120} y1={50} x2={140} y2={50} />
          <Capacitor x={150} y={50} label="Cout" />
          <Wire x1={156} y1={50} x2={175} y2={50} />
          <Wire x1={92} y1={62} x2={92} y2={70} />
          <Resistor x={92} y={75} label="Re" horizontal={false} />
          <Wire x1={92} y1={80} x2={92} y2={88} />
          <Wire x1={20} y1={88} x2={180} y2={88} />
          <Wire x1={50} y1={85} x2={50} y2={88} />
          <Out x={178} y={50} />
          <Ground x={100} y={88} />
        </>
      );
    default:
      return <text x={100} y={50} textAnchor="middle" {...LABEL}>—</text>;
  }
}
