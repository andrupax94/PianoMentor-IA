"use client";

// description: Overlay de carga de sonidos del piano (U-004): bloquea la pagina (excepto el header) hasta que todas las muestras esten cargadas, con barra de progreso. No se muestra si la carga termina en menos de 200 ms (cache).
// context: Client component; consume useTransport() para leer soundProgress/soundReady. Se monta dentro de TransportProvider.

import { useEffect, useState } from "react";

import { useTransport } from "../../lib/transport-context";

export function SoundLoadingOverlay() {
  const player = useTransport();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (player.soundReady) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(t);
  }, [player.soundReady]);

  if (!visible || player.soundReady) return null;
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
      <div style={{ fontSize: 16, fontWeight: 600 }}>Cargando sonidos del piano...</div>
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