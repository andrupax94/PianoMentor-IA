// description: Medidor circular reutilizable (SVG puro).
// context: B-006.4; armazón estático.

import styles from "./GaugeChart.module.css";
import type { GaugeChartProps } from "./GaugeChart.types";

const RADIUS = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function GaugeChart({ value = 0, label = "", color = "var(--accent)" }: GaugeChartProps) {
  const clamped = Math.min(Math.max(value, 0), 100);
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;
  return (
    <div className={styles.gauge}>
      <svg width="90" height="90" viewBox="0 0 90 90" role="img" aria-label={`${label}: ${clamped}%`}>
        <circle cx="45" cy="45" r={RADIUS} fill="none" stroke="#2b3544" strokeWidth="8" />
        <circle
          cx="45"
          cy="45"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 45 45)"
        />
        <text x="45" y="50" textAnchor="middle" className={styles.number}>
          {clamped}%
        </text>
      </svg>
      <p>{label}</p>
    </div>
  );
}
