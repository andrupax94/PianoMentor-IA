// description: Medidor circular reutilizable (SVG puro).
// context: B-006.4; armazón estático.

import styles from "./GaugeChart.module.css";
import type { GaugeChartProps } from "./GaugeChart.types";

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function GaugeChart({ value = 0, label = "" }: GaugeChartProps) {
  const clamped = Math.min(Math.max(value, 0), 100);
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;
  return (
    <div className={styles.gauge}>
      <svg width="110" height="110" viewBox="0 0 110 110" role="img" aria-label={`${label}: ${clamped}%`}>
        <circle cx="55" cy="55" r={RADIUS} fill="none" stroke="#2b3544" strokeWidth="10" />
        <circle
          cx="55"
          cy="55"
          r={RADIUS}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 55 55)"
        />
        <text x="55" y="61" textAnchor="middle" className={styles.number}>
          {clamped}%
        </text>
      </svg>
      <p>{label}</p>
    </div>
  );
}
