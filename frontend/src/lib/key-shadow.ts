// description: Dirección e intensidad de la sombra interna de la tecla pulsada.
// context: D-002.4; puro y testeable, sin DOM ni SVG: el componente solo pinta lo que este módulo decide, así la matemática se puede probar aparte.

/** Lado de la tecla por el que entra la sombra. */
export type ShadowSide = "left" | "right";

/** Sombra decidida para una tecla: lado de entrada y fuerza (1 suave → 3 máxima). */
export interface KeyShadow {
  side: ShadowSide;
  level: 1 | 2 | 3;
}

/**
 * Sombra de la tecla pulsada según su posición en la ventana visible.
 *
 * `t` es la fracción horizontal de la tecla en el teclado que se ve en pantalla:
 * 0 = extremo izquierdo, 1 = extremo derecho, 0.5 = centro.
 *
 * La sombra entra **hacia el centro** (lo que se pidió): las teclas de la
 * izquierda la reciben por su lado derecho y las de la derecha por su izquierdo,
 * y cuanto más lejos del centro, más fuerte (nivel 1–3).
 */
export function keyShadow(t: number): KeyShadow {
  const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.5;
  const side: ShadowSide = clamped < 0.5 ? "right" : "left";
  const edge = Math.abs(clamped - 0.5) * 2; // 0 en el centro, 1 en el extremo
  const level: 1 | 2 | 3 = edge < 0.34 ? 1 : edge < 0.67 ? 2 : 3;
  return { side, level };
}

/** Id del `linearGradient` fijo que pinta esa sombra (`pm-shadow-l2`, `pm-shadow-r3`…). */
export function shadowGradientId(shadow: KeyShadow): string {
  return `pm-shadow-${shadow.side === "left" ? "l" : "r"}${shadow.level}`;
}
