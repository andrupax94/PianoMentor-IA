// description: Sub-pestaña «LLM» del menú Depurar (B-036.1, dev-only): los modos de caos para verificar a mano la política de reintentos — Normal, «Forzar fallo (429 una vez)» y «429 siempre (agota reintentos)» — fijados vía /api/v1/dev/llm/chaos, con la explicación de qué mirar en el log del backend.
// context: El modo vive en memoria del proceso del backend (llm.fijar_llm_chaos); el 429 simulado se levanta ANTES de tocar la red, así que la política real (espera con Retry-After, reintento, salto de proveedor) es la que se ejercita con Groq/Gemini de verdad sin saturarlos. El endpoint responde 404 en producción y SessionDebug no existe fuera de dev. Cambio optimista: si el POST falla, se vuelve al modo anterior con el error a la vista.

"use client";

import { useEffect, useState } from "react";

import { getLlmChaos, setLlmChaos, type LlmChaosModo } from "../../../lib/api-client";
import styles from "./LlmDebug.module.css";

/** Los tres modos, con su etiqueta del aula y qué observar en el log. */
const MODOS: Array<{ modo: LlmChaosModo; label: string; desc: string }> = [
  {
    modo: "",
    label: "Normal",
    desc: "Comportamiento real de la cadena: los reintentos solo actúan si el proveedor de verdad se satura.",
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

export function LlmDebug() {
  const [modo, setModo] = useState<LlmChaosModo>("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

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
    </div>
  );
}
