"use client";
// description: Cuadrícula con las notas cayendo, con la mano que toca la IA pintada en su color durante el acompañamiento (B-012.7).
// context: B-007.3; React pinta solo el chrome estático (líneas y etiquetas). Las
// notas las mueve un bucle rAF local escribiendo transform directamente en el DOM,
// así no se re-renderiza el árbol por frame. La velocidad deriva de la posición del
// transporte: pausar congela la cascada y el factor de tempo la escala que el sonido.

import { useEffect, useMemo, useRef } from "react";

import { fallingNotes, type FallingNote } from "../../../lib/falling-notes";
import { handColor, type AgentHand } from "../../../lib/hand-color";
import { createKeyGeometry, type KeyGeometry } from "../../../lib/key-geometry";
import { HORIZON_S } from "../../../lib/key-states";
import { countWhiteKeys } from "../../../lib/pitch";
import { useVisibleRange } from "../../../lib/useVisibleRange";
import styles from "./NoteFallGrid.module.css";
import type { NoteFallGridProps } from "./NoteFallGrid.types";

/** Suelo de columnas para no renderizar un grid vacío con un rango inválido. */
const MIN_COLUMNS = 1;

/** Altura mínima del bloque, para que una nota muy corta siga viéndose. */
const MIN_BLOCK_PX = 2;

/** Opacidad del bloque según velocity: más fuerte, más marcada la nota. */
function noteOpacity(velocity: number): number {
  const clamped = Math.min(Math.max(velocity, 0), 127);
  return 0.35 + (0.5 * clamped) / 127;
}

/**
 * Coloca un bloque: x de la geometría (centro y ancho de la tecla real) e y del
 * progreso. Al llegar a 1 su borde inferior toca el teclado.
 */
function placeNote(
  block: HTMLDivElement,
  note: FallingNote,
  geometry: KeyGeometry,
  horizon_s: number,
  layerHeight: number,
  agentHand: AgentHand | null,
): void {
  const center = geometry.centerFraction(note.pitch);
  const width = geometry.widthFraction(note.pitch);
  const blockHeight = Math.max(MIN_BLOCK_PX, (note.duration_s / horizon_s) * layerHeight);
  block.style.left = `${(center - width / 2) * 100}%`;
  block.style.width = `${width * 100}%`;
  block.style.height = `${blockHeight}px`;
  block.style.transform = `translateY(${note.progress * layerHeight - blockHeight}px)`;
  block.style.opacity = String(noteOpacity(note.velocity));
  // El pool reutiliza bloques entre notas distintas: el color solo se reescribe
  // si cambia la mano o si empieza/termina el acompañamiento (D-002.1/B-012.7).
  const hand = note.hand ?? "unknown";
  const agent = agentHand !== null && (agentHand === "both" || hand === agentHand);
  const key = `${hand}|${agent ? "agent" : "score"}`;
  if (block.dataset.hand !== key) {
    block.dataset.hand = key;
    block.style.background = handColor(hand, agent ? agentHand : null);
  }
}

export function NoteFallGrid({
  octaves = ["C1", "C2", "C3"],
  schedule = [],
  status = "stopped",
  horizon_s,
  getPosition = () => 0,
  agentHand = null,
}: NoteFallGridProps) {
  const { fromKey, toKey } = useVisibleRange();
  const columns = Math.max(MIN_COLUMNS, countWhiteKeys(fromKey, toKey));
  const geometry = useMemo(() => createKeyGeometry(fromKey, toKey), [fromKey, toKey]);
  const lines = useMemo(() => Array.from({ length: columns }, (_, index) => index), [columns]);
  const horizon = horizon_s && horizon_s > 0 ? horizon_s : HORIZON_S;

  const layerRef = useRef<HTMLDivElement | null>(null);
  const poolRef = useRef(new Map<string, HTMLDivElement>());
  const heightRef = useRef(0);
  // Refs estables: el bucle rAF lee la última sin reiniciarse en cada render.
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;
  const getPositionRef = useRef(getPosition);
  getPositionRef.current = getPosition;
  const horizonRef = useRef(horizon);
  horizonRef.current = horizon;
  // La mano de la IA se lee en cada frame: cambiar de acompañamiento no reinicia el bucle.
  const agentHandRef = useRef<AgentHand | null>(agentHand);
  agentHandRef.current = agentHand;

  // Altura del lienzo: los bloques se desplazan en píxeles (transform va por GPU).
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const apply = () => {
      heightRef.current = layer.clientHeight;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);

  // Cascada: mientras suena, un rAF local mueve los bloques sin re-render de React.
  useEffect(() => {
    const pool = poolRef.current;

    // En stop no se pinta nada (la posición vuelve a 0).
    if (status === "stopped") {
      for (const block of pool.values()) block.remove();
      pool.clear();
      return;
    }
    // En pausa se salen sin borrar: los bloques quedan congelados donde estaban,
    // que es lo que pide B-007.3 ("en pausa nada se mueve").
    if (status !== "playing") return;

    const layer = layerRef.current;
    if (!layer) return;
    let frame = 0;

    const step = () => {
      const notes = fallingNotes(scheduleRef.current, getPositionRef.current(), horizonRef.current);
      const seen = new Set<string>();
      for (const note of notes) {
        const center = geometryRef.current.centerFraction(note.pitch);
        // Nota cuya tecla no está en la ventana visible: no se pinta (el overflow
        // la recortaría igual) y si ya tenía bloque, el filtro de abajo lo retira.
        if (center < 0 || center > 1) continue;
        seen.add(note.id);
        let block = pool.get(note.id);
        if (!block) {
          block = document.createElement("div");
          block.className = styles.note;
          block.dataset.keyId = note.keyId;
          layer.appendChild(block);
          pool.set(note.id, block);
        }
        placeNote(
          block,
          note,
          geometryRef.current,
          horizonRef.current,
          heightRef.current,
          agentHandRef.current,
        );
      }
      // Fuera de la ventana: se recicla el bloque.
      for (const [id, block] of pool) {
        if (!seen.has(id)) {
          block.remove();
          pool.delete(id);
        }
      }
      frame = window.requestAnimationFrame(step);
    };

    frame = window.requestAnimationFrame(step);
    // Solo se cancela el bucle; al desmontar los bloques se van con su contenedor.
    return () => window.cancelAnimationFrame(frame);
  }, [status]);

  return (
    <div className={styles.grid} aria-label="Notas cayendo">
      {/* El inset iguala las líneas al área de teclas: SvgKeyboard deja 8 u de margen. */}
      <div
        className={styles.lines}
        aria-hidden="true"
        style={{ paddingInline: `${geometry.insetFraction * 100}%` }}
      >
        {lines.map((index) => (
          <span key={index} className={styles.line} />
        ))}
      </div>
      <div ref={layerRef} className={styles.notes} aria-hidden="true" />
      <div className={styles.side}>
        {octaves.map((octave) => (
          <span key={`left-${octave}`}>{octave}</span>
        ))}
      </div>
      {/* Solo en reposo: mientras hay notas cayendo, el aviso estorbaría. */}
      {status === "stopped" && <p className={styles.hint}>Aquí caerán las notas.</p>}
      <div className={styles.side}>
        {octaves.map((octave) => (
          <span key={`right-${octave}`}>{octave}</span>
        ))}
      </div>
      <span className={styles.final__line}></span>
    </div>

  );
}
