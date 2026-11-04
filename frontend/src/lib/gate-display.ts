// description: Visualización pura del gate esperado (B-032.8): el rebote de la cascada — sobrepasa la línea un margen proporcional a la nota, rebobina suave y queda quieta en el punto de pulsación mientras se espera. El hit y la tecla errónea solo desvanecen el offset, nunca mueven el transporte.
// context: Sin DOM ni React; el motor (displayPosition_s) y la controladora de gates lo consumen. Todo el arte está en el transporte congelado en gate.time_s: aquí solo se calcula el offset que se pinta por encima. Velocidades consistentes: en waiting el schedule corre 1 segundo de partitura escalada por cada segundo de reloj, así que el sobresalto avanza a la misma velocidad que venía la barra.

/** Fracción de la duración de la nota que la barra se pasa de la línea. */
export const GATE_OVERSHOOT_RATIO = 0.4;
/** Recortes del sobresalto en segundos (ya escalados, como corre el schedule). */
export const GATE_OVERSHOOT_MIN_S = 0.15;
export const GATE_OVERSHOOT_MAX_S = 0.5;
/** Duración del rebobinado (y de cualquier desvanecimiento del offset). */
export const GATE_REWIND_S = 0.15;

/**
 * El sobresalto del gate: 40 % de la duración de la nota (pidió el usuario
 * aumentar el 25 % original), recortado a [150 ms, 500 ms] para no verse
 * absurdo en extremos (nota cortísima o larga).
 */
export function gateOvershoot_s(duration_s: number): number {
  const duration = Math.max(0, duration_s);
  return Math.min(GATE_OVERSHOOT_MAX_S, Math.max(GATE_OVERSHOOT_MIN_S, duration * GATE_OVERSHOOT_RATIO));
}

/**
 * Offset sobre `gate.time_s` (segundos escalados) según el tiempo llevado
 * esperando (en segundos de reloj):
 *
 * - primero avanza hasta `overshoot_s` (la misma velocidad del transporte);
 * - después rebobina con easing cuadrático hasta la línea en `rewind_s`;
 * - y de ahí en adelante queda en la línea, quieta, hasta que el alumno actúe.
 *
 * Gate sin duración conocida (0): nunca sobrepasa, offset 0 siempre.
 */
export function waitingGateOffset_s(
  wait_s: number,
  overshoot_s: number,
  rewind_s: number = GATE_REWIND_S,
): number {
  if (overshoot_s <= 0) return 0;
  if (wait_s <= 0) return 0;

  if (wait_s < overshoot_s) return wait_s;

  const rewind = Math.max(0, rewind_s);
  if (rewind === 0) return 0;
  const rewound = wait_s - overshoot_s;
  if (rewound >= rewind) return 0;

  // Ease-out quad: arranca rápido y se posa en la línea.
  const progress = rewound / rewind;
  return overshoot_s * (1 - (1 - (1 - progress) * (1 - progress)));
}

/**
 * Desvanecimiento lineal de un offset que ya no debe verse (el rebote por
 * tecla errónea, y el exceso que la barra lleva por encima de la línea cuando
 * el gate se satisface antes del rebobinado). En `settle_s` llega a 0 y se
 * queda; los negativos dan 0.
 */
export function decayOffset_s(
  offset_s: number,
  elapsed_s: number,
  settle_s: number = GATE_REWIND_S,
): number {
  if (offset_s <= 0) return 0;
  const settle = Math.max(0, settle_s);
  if (settle === 0) return 0;
  if (elapsed_s <= 0) return offset_s;
  if (elapsed_s >= settle) return 0;
  return offset_s * (1 - elapsed_s / settle);
}
