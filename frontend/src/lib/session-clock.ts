// description: Reloj del estudiante que marca el t_s de las notas de práctica.
// context: B-012.1; se ancla en la primera tecla, que es cuando la práctica empieza de verdad. B-012.5 lo moverá al transporte de reproducción (B-006.2), que ya sabe cuándo empieza la pieza.

/** Segundos transcurridos desde el origen del reloj, con el origen elegido a mano. */
export interface SessionClock {
  /** Segundos desde el ancla; la crea en la primera llamada si aún no la hay. */
  elapsedSeconds(): number;
  /** Quitar el ancla: la próxima llamada vuelve a contar desde cero. */
  reset(): void;
}

/**
 * Crea un reloj de sesión. `now` existe para los tests: en el navegador usa
 * performance.now(), que es monotónico e independiente del reloj del sistema.
 */
export function createSessionClock(now: () => number = () => performance.now()): SessionClock {
  let anchor: number | null = null;

  return {
    elapsedSeconds() {
      if (anchor === null) anchor = now();
      return (now() - anchor) / 1000;
    },
    reset() {
      anchor = null;
    },
  };
}
