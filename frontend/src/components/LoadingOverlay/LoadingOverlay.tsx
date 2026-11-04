"use client";
// description: Overlay global de carga reutilizable (reemplaza SoundLoadingOverlay).
// context: Consume loadingService (estado reactivo) y pinta la barra real/indeterminada.
// Se monta una vez en el layout dentro de TransportProvider.

import { useLoading } from "../../lib/loading-service";

export function LoadingOverlay() {
  const { visible, percent, info, size, opacity } = useLoading();
  if (!visible) return null;

  const sizeMap = { big: 96, mid: 65, small: 36 };
  const sizeValue = sizeMap[size as keyof typeof sizeMap] || sizeMap.big;

  return (
    <div
      style={{
        position: "fixed",
        top: 64,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: opacity ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.55)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        color: "#fff",
      }}
      role="status"
      aria-live="polite"
    >
      <div style={{ fontSize: 16, fontWeight: 600 }}>{info}</div>
      <div
        style={{
          width: 320,
          height: 8,
          background: "rgba(255,255,255,0.2)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background: "#d4af37",
            transition: "width 0.2s ease",
          }}
        />
      </div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{percent}%</div>
      <svg
        className="spinner"
        width={sizeValue}
        height={sizeValue}
        viewBox="0 0 66 66"
        xmlns="http://www.w3.org/2000/svg"
        style={{ opacity: 0.6 }}
      >
        <circle
          className="path"
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          cx="33"
          cy="33"
          r="30"
          stroke="#d4af37"
        />
      </svg>
    </div>
  );
}
