// description: Sub-pestaña «LLM» del menú Depurar (B-036.1, dev-only): los modos de caos para verificar a mano la política de reintentos — Normal, «Forzar fallo (429 una vez)» y «429 siempre (agota reintentos)» — fijados vía /api/v1/dev/llm/chaos, con la explicación de qué mirar en el log del backend; y desde B-033.6 la sección «Opinión del evaluador sobre un paquete»: se importa el .zip de B-033.5, se lee solo su informe.json y el MISMO pipeline de interpretación (buildInterpretation + turno ephemeral con el summary agregado) da la opinión del evaluador sin repetir la pieza — inline y rotulada como paquete importado, sin tocar la sesión activa (lastStep intacto) y sin que el WAV salga del navegador.
// context: El modo de caos vive en memoria del proceso del backend (llm.fijar_llm_chaos); el 429 simulado se levanta ANTES de tocar la red, así que la política real (espera con Retry-After, reintento, salto de proveedor) es la que se ejercita con Groq/Gemini de verdad sin saturarlos. El endpoint responde 404 en producción y SessionDebug no existe fuera de dev. Cambio optimista: si el POST falla, se vuelve al modo anterior con el error a la vista. La importación (B-033.6) es local: descomprime readStoreZip, valida lib/paquete-import y solo viaja al LLM el contexto agregado, igual que la interpretación en vivo de B-033.4.

"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getLlmChaos,
  sendAgentMessage,
  setLlmChaos,
  type LlmChaosModo,
} from "../../../lib/api-client";
import type { PracticeReport } from "../../../lib/api-client";
import {
  importarPaquete,
  type FichaPaquete,
} from "../../../lib/paquete-import";
import {
  buildInterpretation,
  interpretationContext,
  interpretationPrompt,
  type InterpretationBlock,
} from "../../../lib/session-interpretation";
import styles from "./LlmDebug.module.css";

/** Los tres modos, con su etiqueta del aula y qué observar en el log. */
const MODOS: Array<{ modo: LlmChaosModo; label: string; desc: string }> = [
  {
    modo: "",
    label: "Normal",
    desc: "Comportamiento real de la cadena: los reintentos solo actúan si el proveedor de verdad se saturó.",
  },
  {
    modo: "una",
    label: "Forzar fallo (429 una vez)",
    desc: "Cada mensaje del chat entra con un 429 simulado. En el log del backend verás «429 SIMULADO (caos «una», intento 1)» y «reintento 1/1 en 2.0 s», y la respuesta sale por el proveedor real (~2 s extra de espera en el chat).",
  },
  {
    modo: "siempre",
    label: "429 siempre (agota reintentos)",
    desc: "Todos los intentos fallan simulados: se ve el agotamiento («reintento 1/1») y el salto de proveedor («[llm] groq falló (429 …); salto al siguiente») hasta el fallback determinista, que responde igual.",
  },
];

/** El paquete elegido: nada, leyendo, error amable o el informe validado con su ficha. */
type Importado =
  | { fase: "elegir" }
  | { fase: "leyendo" }
  | { fase: "error"; mensaje: string }
  | { fase: "lista"; informe: PracticeReport; ficha: FichaPaquete };

/** La opinión pedida sobre el paquete importado. */
type Opinion =
  | { fase: "reposo" }
  | { fase: "pidiendo" }
  | { fase: "lista"; bloques: InterpretationBlock[]; redaccion: string | null; fallback: boolean };

export function LlmDebug() {
  const [modo, setModo] = useState<LlmChaosModo>("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const [importado, setImportado] = useState<Importado>({ fase: "elegir" });
  const [opinion, setOpinion] = useState<Opinion>({ fase: "reposo" });

  useEffect(() => {
    let activo = true;
    getLlmChaos()
      .then((estado) => {
        if (activo) setModo(estado.modo);
      })
      .catch((fallo: unknown) => {
        if (activo) setError(fallo instanceof Error ? fallo.message : "No se pudo leer el modo de caos.");
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  async function elegir(siguiente: LlmChaosModo) {
    const anterior = modo;
    setModo(siguiente); // optimista: el backend es la verdad, se corrige luego
    setError(null);
    try {
      const estado = await setLlmChaos(siguiente);
      setModo(estado.modo);
    } catch (fallo: unknown) {
      setModo(anterior);
      setError(fallo instanceof Error ? fallo.message : "No se pudo fijar el modo de caos.");
    }
  }

  /** Importación local: descomprime y valida; el WAV no se lee como audio ni sale del navegador. */
  const importar = useCallback(async (fichero: File | null) => {
    if (fichero === null) return;
    setOpinion({ fase: "reposo" }); // paquete nuevo, opinión vieja fuera
    setImportado({ fase: "leyendo" });
    const resultado = await importarPaquete(fichero);
    setImportado(
      resultado.ok
        ? { fase: "lista", informe: resultado.informe, ficha: resultado.ficha }
        : { fase: "error", mensaje: resultado.mensaje },
    );
  }, []);

  /** El MISMO pipeline que la interpretación en vivo (B-033.4): destacados agregados + turno ephemeral. */
  const pedirOpinion = useCallback(async (informe: PracticeReport) => {
    setOpinion({ fase: "pidiendo" });
    const interpretation = buildInterpretation(informe.summary, informe.session.tempo ?? null);
    if (!interpretation.hasPractice) {
      setOpinion({ fase: "lista", bloques: [], redaccion: null, fallback: false });
      return;
    }
    try {
      const respuesta = await sendAgentMessage({
        message: interpretationPrompt(),
        chat_id: null, // sin chat abierto: el turno efímero no graba historial
        context: interpretationContext(interpretation, { origen: "paquete-importado" }),
        ephemeral: true,
        max_tokens: 1200,
      });
      const sinRedaccion = respuesta.provider === "mock" || respuesta.used_fallback;
      setOpinion({
        fase: "lista",
        bloques: interpretation.blocks,
        redaccion: sinRedaccion || !respuesta.reply.trim() ? null : respuesta.reply.trim(),
        fallback: respuesta.used_fallback,
      });
    } catch {
      // Sin redacción la opinión sigue siendo legible: quedan los bloques deterministas.
      setOpinion({ fase: "lista", bloques: interpretation.blocks, redaccion: null, fallback: false });
    }
  }, []);

  return (
    <div className={styles.root}>
      <p className={styles.hint}>
        Verificación de la política de reintentos (B-036.1). El 429 simulado se
        levanta en el backend antes de tocar la red: los reintentos, la espera y
        el salto son los reales. Mira la consola del backend mientras escribes en
        el chat.
      </p>
      <div className={styles.modos} role="group" aria-label="Modo de caos del LLM">
        {MODOS.map((opcion) => (
          <button
            key={opcion.modo}
            type="button"
            className={modo === opcion.modo ? styles.modoActive : styles.modo}
            aria-pressed={modo === opcion.modo}
            disabled={cargando}
            onClick={() => elegir(opcion.modo)}
          >
            {opcion.label}
          </button>
        ))}
      </div>
      {MODOS.filter((opcion) => opcion.modo === modo).map((opcion) => (
        <p key={opcion.modo} className={styles.desc}>
          {opcion.desc}
        </p>
      ))}
      {error && <p className={styles.error}>{error}</p>}

      <hr className={styles.separador} />

      <p className={styles.hint}>
        Opinión del evaluador sobre un paquete (B-033.6): elige el .zip bajado de
        Depurar → Informe y se pide la MISMA opinión que da tras la práctica —
        sin repetir la pieza. Solo se lee su informe.json: el audio no sale del
        navegador y la sesión activa no se toca.
      </p>
      <label className={styles.fichero}>
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={(event) => {
            void importar(event.target.files?.[0] ?? null);
            event.target.value = ""; // re-elegir el mismo fichero vuelve a importar
          }}
        />
      </label>
      {importado.fase === "leyendo" && <p className={styles.desc}>Leyendo el paquete…</p>}
      {importado.fase === "error" && <p className={styles.error}>{importado.mensaje}</p>}
      {importado.fase === "lista" && (
        <div className={styles.paquete}>
          <p className={styles.ficha}>
            Paquete importado · {importado.ficha.pieceTitle ?? "pieza sin título"} ·{" "}
            {importado.ficha.senales} señales · sesión {importado.ficha.sessionId} · informe del{" "}
            {new Date(importado.ficha.generadoEn).toLocaleString()}
          </p>
          {opinion.fase === "reposo" && (
            <button
              type="button"
              className={styles.modo}
              onClick={() => void pedirOpinion(importado.informe)}
            >
              Pedir opinión del evaluador
            </button>
          )}
          {opinion.fase === "pidiendo" && <p className={styles.desc}>Pidiendo la opinión…</p>}
          {opinion.fase === "lista" && <OpinionBloques opinion={opinion} />}
        </div>
      )}
    </div>
  );
}

/** Los bloques deterministas + la redacción del evaluador, rotulados como paquete importado. */
function OpinionBloques({ opinion }: { opinion: Extract<Opinion, { fase: "lista" }> }) {
  if (opinion.bloques.length === 0) {
    return <p className={styles.desc}>El paquete no tiene práctica registrada (0 señales): no hay nada que opinar.</p>;
  }
  return (
    <div className={styles.opinion}>
      <p className={styles.desc}>
        Opinión sobre el paquete importado{opinion.fallback ? " (fallback determinista: sin proveedor real en la cadena)" : ""}:
      </p>
      {opinion.bloques.map((bloque) => (
        <div key={bloque.heading} className={styles.bloque}>
          <h4 className={styles.bloqueHead}>{bloque.heading}</h4>
          <ul className={styles.bloqueLines}>
            {bloque.lines.map((linea, index) => (
              <li key={index}>{linea}</li>
            ))}
          </ul>
        </div>
      ))}
      {opinion.redaccion && <p className={styles.redaccion}>{opinion.redaccion}</p>}
    </div>
  );
}
