// description: Contexto del transporte único de la portada (B-032.2): TransportProvider crea el reproductor en el layout y PlaybackArea y PracticeBridge lo consumen con useTransport.
// context: Un solo `usePlayback` por página; el provider no se remonta al navegar entre / y /{id}, así que la posición sobrevive y la sesión y el piano leen el mismo reloj. Fuera del provider es un error de composición, no un caso a tolerar.

import { createContext, useContext } from "react";

import type { PlaybackHandle } from "./usePlayback";

export const TransportContext = createContext<PlaybackHandle | null>(null);

/** Transporte vigente; lanza si se usa fuera de `<TransportProvider>`. */
export function useTransport(): PlaybackHandle {
  const transport = useContext(TransportContext);
  if (transport === null) {
    throw new Error("useTransport debe usarse dentro de <TransportProvider>");
  }
  return transport;
}
