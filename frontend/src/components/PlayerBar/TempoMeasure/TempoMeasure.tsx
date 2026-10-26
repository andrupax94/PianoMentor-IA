// description: Tempo efectivo editable (input numérico de BPM con min/máx del rango del motor), compás actual/total y firma en reproducción, con indicador vacío (—) cuando falta el dato.
// context: B-008.3; el tempo es real (BPM × factor) desde B-007.3 y el compás real desde B-008.3, sin valores inventados. La edición (B-006.5) solo existe con baseTempoBpm + onTempoChange: mientras el usuario teclea vive un borrador local y al salir manda el valor real ya recortado.

import { useState } from "react";

import { formatMeasure, formatSignature } from "../../../lib/measures";
import { MAX_TEMPO_FACTOR, MIN_TEMPO_FACTOR } from "../../../lib/playback-schedule";
import styles from "./TempoMeasure.module.css";
import type { TempoMeasureProps } from "./TempoMeasure.types";

export function TempoMeasure({
  tempoBpm,
  baseTempoBpm,
  onTempoChange,
  measure,
  measureCount,
  signature,
}: TempoMeasureProps) {
  /** Texto mientras se teclea; null = mostrar el tempo efectivo del motor. */
  const [draft, setDraft] = useState<string | null>(null);

  // Editable solo con tempo base conocido y a quién avisar; el resto de casos
  // conservan el texto de siempre (nunca un valor inventado).
  const editable =
    onTempoChange != null && tempoBpm != null && baseTempoBpm != null && baseTempoBpm > 0;

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    setDraft(raw);
    const bpm = Number(raw);
    // Un campo vacío o a medio teclear no cambia la velocidad: solo cuando el
    // número es usable se manda el tempo pedido (el motor lo recorta al rango).
    if (raw.trim() !== "" && Number.isFinite(bpm) && bpm > 0) {
      onTempoChange?.(bpm);
    }
  };

  return (
    <div className={styles.tempo}>
      <p>
        <span style={{ maskImage: 'url("/assets/icons/metronome.svg")' }}></span>
        <span>Tempo: </span>
        {editable ? (
          <input
            className={styles.bpm}
            type="number"
            inputMode="decimal"
            min={Math.round((baseTempoBpm ?? 1) * MIN_TEMPO_FACTOR)}
            max={Math.round((baseTempoBpm ?? 1) * MAX_TEMPO_FACTOR)}
            step={1}
            value={draft ?? String(tempoBpm)}
            aria-label="Tempo en BPM"
            onChange={onChange}
            // Al salir, el borrador se suelta y manda el valor real del motor,
            // ya con el recorte de rango aplicado.
            onBlur={() => setDraft(null)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        ) : tempoBpm == null ? (
          "–"
        ) : (
          `${tempoBpm} BPM`
        )}
      </p>

      <p>
        <span style={{ maskImage: 'url("/assets/icons/cronometer.svg")' }}></span>
        <span>Compás: </span>
        {formatMeasure(measure, measureCount)}
      </p>

      <p>
        <span style={{ maskImage: 'url("/assets/icons/firma.svg")' }}></span>
        <span>Firma: </span>
        {formatSignature(signature)}
      </p>
    </div>
  );
}
