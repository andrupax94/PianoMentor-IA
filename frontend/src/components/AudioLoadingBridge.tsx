"use client";
// description: Puente entre el transporte (progreso real de carga de sonidos) y loadingService.
// context: Mantiene la barra real del audio usando el overlay global reutilizable.

import { useEffect } from "react";
import { useTransport } from "../lib/transport-context";
import { loadingService } from "../lib/loading-service";

export function AudioLoadingBridge() {
  const player = useTransport();
  useEffect(() => {
    if (player.soundReady) {
      loadingService.changeInfo("audio", "Cargando sonidos del piano...", 100);
      loadingService.pause("audio");
      return;
    }
    // Evita parpadeo: solo se muestra si tarda más de 200 ms.
    const t = setTimeout(() => {
      loadingService.to("audio", "mid", true);
      loadingService.changeInfo(
        "audio",
        "Cargando sonidos del piano...",
        Math.round((player.soundProgress ?? 0) * 100),
      );
    }, 200);
    return () => clearTimeout(t);
  }, [player.soundReady]);

  useEffect(() => {
    if (!player.soundReady) {
      loadingService.changeInfo(
        "audio",
        "Cargando sonidos del piano...",
        Math.round((player.soundProgress ?? 0) * 100),
      );
    }
  }, [player.soundProgress, player.soundReady]);

  return null;
}
