"use client";

// description: Overlay de carga de sonidos del piano (U-004): bloquea la página (excepto el header) hasta que todas las muestras estén cargadas, con barra de progreso.
// context: Client component; consume useTransport() para leer soundProgress/soundReady. Se monta dentro de TransportProvider.

import { useTransport } from "../../lib/transport-context";

export function SoundLoadingOverlay() {
  const player = useTransport();
  if (player.soundReady) return null;
  const pct = Math.round((player.soundProgress ?? 0) * 100);
  return (
    <div
      style={{
        position: "fixed",
        top: 64,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
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
      <div style={{ fontSize: 16, fontWeight: 600 }}>Cargando sonidos del piano…</div>
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
            width: `${pct}%`,
            height: "100%",
            background: "#d4af37",
            transition: "width 0.2s ease",
          }}
        />
      </div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{pct}%</div>
    </div>
  );
}