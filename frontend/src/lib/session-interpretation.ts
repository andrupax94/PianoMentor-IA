// description: Interpretación del mentor para el modo maximizado del chat (B-033.4): buildInterpretation, función pura que traduce el resumen determinista del informe de práctica (PracticeSummary de B-033.3) a los bloques fijos que el alumno lee («Lo que salió bien», «A mejorar», «Lo que hice yo», «Recomendaciones»), más el prompt y el contexto del turno efímero del chat con el que el LLM redacta su versión amable. Revisión del 2026-11-09 (petición del usuario): la apertura se conecta en una frase (práctica + notas + acierto en % + valoración), se habla de notas/teclas en vez de «entradas», y el prompt pide redacción larga en TEXTO PLANO (nada de ** ni listas) con algún emoji de conversación.
// context: B-033.4; la lógica de las frases vive en src/lib, no en el componente. Es además el fallback determinista de la casa: si el LLM no está (Mock en la cadena) o su turno falla, lo que se muestra son estos bloques tal cual, sin error visible. La voz es la de la skill piano-mentor-chat-burbuja: mentor en primera persona, alumno en segunda, sin códigos ni siglas (los outcomes se traducen: teclas equivocadas, notas que llegaron tarde; el gate del fallo dominante no se imprime — diagnóstico, no contenido del alumno).

import type { PracticeSummary } from "./api-client";

/** Un bloque legible de la interpretación: título fijo y líneas listadas. */
export interface InterpretationBlock {
  heading: string;
  lines: string[];
}

/** La interpretación completa lista para renderizar. */
export interface Interpretation {
  /** false: la sesión todavía no tiene señales; se muestra «no hay práctica que comentar». */
  hasPractice: boolean;
  /** Frases planas de la interpretación, en el orden de los bloques: la que viaja al turno efímero del chat para que el LLM redacte su versión amable. */
  lines: string[];
  /** Bloques fijos, ya filtrados: sin líneas no existe. */
  blocks: InterpretationBlock[];
}

/** Verdades del alumno: cómo se llama cada outcome del gate (B-032.5, sin códigos).
 * Revisión del 2026-11-09 (petición del usuario): hablamos de notas y teclas,
 * no de «entradas» — es lo que el alumno entiende desde la primera clase. */
const OUTCOME_LABELS: Record<string, string> = {
  miss: "notas sin resolver",
  wrong: "teclas equivocadas",
  timeout: "notas que llegaron tarde",
};

/** Las mismas, en singular, para los detalles de un solo fallo. */
const OUTCOME_LABELS_ONE: Record<string, string> = {
  miss: "nota sin resolver",
  wrong: "tecla equivocada",
  timeout: "nota que llegó tarde",
};

/** Cómo se dice cada motivo estable de las reglas (código → aula). */
const INTERVENTION_REASONS: Record<string, string> = {
  gate_repeated_strikes: "por fallos repetidos en la misma tecla",
  gate_timeout_silence: "por silencios demasiado largos en una nota",
};

/** Qué hice yo, en primera persona del mentor (acciones de la lista blanca). */
const INTERVENTION_VERBS: Record<string, string> = {
  slow_down: "bajé el tempo",
  give_hint: "te di una pista",
  demonstrate: "te mostré una demostración",
  offer_demo: "te ofrecí una demostración",
  accompany: "te acompañé",
  return_control: "te devolví el control",
};

/** Segundos de práctica a texto del aula: «2 min 10 s», «45 s». */
export function formatPracticed(seconds: number | null): string | null {
  if (seconds === null || seconds < 0 || !Number.isFinite(seconds)) return null;
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/** Nombre del compás para el aula: sin rejilla, se queda en «el pasaje sin compases». */
function measureLabel(measure: number | null): string {
  return measure === null ? "el pasaje sin compases" : `el compás ${measure}`;
}

/** Los conteos de fallo de un compás al detalle: «2 teclas equivocadas y 1 nota que llegó tarde». */
function failureDetail(counts: Record<string, number>): string | null {
  const partes = Object.entries(OUTCOME_LABELS)
    .map(([key, plural]) => {
      const count = counts[key] ?? 0;
      if (count <= 0) return null;
      const label = count === 1 ? (OUTCOME_LABELS_ONE[key] ?? plural) : plural;
      return count === 1 ? `1 ${label}` : `${count} ${label}`;
    })
    .filter((part): part is string => part !== null);
  if (partes.length === 0) return null;
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
}

/** True si es un resumen con práctica (alguna señal); la forma vacía no es práctica. */
function hasPractice(summary: PracticeSummary | null | undefined): summary is PracticeSummary {
  return summary !== null && summary !== undefined && summary.signals > 0;
}

/**
 * Traducción determinista del resumen a la interpretación del mentor.
 *
 * La misma sesión produce siempre las mismas frases (nada de azar ni del
 * LLM): los destacados son fríos y el turno efímero del chat los convierte
 * en un relato amable aparte que nunca sustituye a estos bloques.
 */
export function buildInterpretation(summary: PracticeSummary | null | undefined): Interpretation {
  if (!hasPractice(summary)) {
    return {
      hasPractice: false,
      lines: [],
      blocks: [],
    };
  }
  // Criterio del usuario (revisión del 2026-11-09): la apertura se conecta en
  // UNA sola frase — práctica + notas + acierto + valoración — y lo demás son
  // datos sueltos que solo aparecen si merecen la pena (pasaje completo).
  // Los textos van en notas/teclas, no en «entradas» (voz del aula).

  const good: string[] = [];
  const improve: string[] = [];
  const mine: string[] = [];
  const recommend: string[] = [];

  // -- Lo que salió bien ---------------------------------------------------
  const attempts = summary.signals;
  const hits = summary.outcomes.hit ?? 0;
  const unidades = attempts === 1 ? "nota" : "notas";
  const compases = summary.active_measures === 1 ? "compás" : "compases";
  const ratio = summary.hit_ratio ?? 0;
  const porcentaje = Math.round(ratio * 100);
  const acierto =
    hits === attempts
      ? "nada falló"
      : `acertaste el ${porcentaje}% de las notas (${hits} de ${attempts})`;
  const valoraciónLine =
    summary.evaluation && typeof summary.evaluation.score_total === "number"
      ? ` y una valoración de ${summary.evaluation.score_total} de 100`
      : "";
  good.push(
    `Practicaste ${formatPracticed(summary.practiced_s) ?? "un rato"} tocando ${attempts} ${unidades} sobre ${
      summary.active_measures
    } ${compases}: ${acierto}${valoraciónLine}.`,
  );
  if (hits === attempts && summary.evaluation && summary.evaluation.received_ratio === 1) {
    good.push("Se oyó el pasaje completo, nota a nota.");
  }

  // -- A mejorar -----------------------------------------------------------
  for (const worst of summary.worst_measures) {
    const failures = worst.attempts - (worst.counts.hit ?? 0);
    if (failures <= 0) continue;
    const detail = failureDetail(worst.counts);
    improve.push(
      `${measureLabel(worst.measure)}: ${failures} ${
        failures === 1 ? "fallo" : "fallos"
      } de ${worst.attempts} notas${detail ? ` — ${detail}` : ""}.`,
    );
  }
  if (summary.dominant_failure) {
    const label = OUTCOME_LABELS[summary.dominant_failure.outcome] ?? "fallos";
    improve.push(`Lo más repetido del rato: ${summary.dominant_failure.count} ${label}.`);
  }

  // -- Lo que hice yo ------------------------------------------------------
  if (summary.interventions.count === 0) {
    mine.push("No intervine: seguiste solo en todo momento.");
  } else {
    for (const [action, count] of Object.entries(summary.interventions.by_action)) {
      const verb = INTERVENTION_VERBS[action] ?? "te apoyé";
      mine.push(`${count === 1 ? "Una vez" : `${count} veces`} ${verb}.`);
    }
    const reasons = Object.entries(summary.interventions.by_reason)
      .map(([reason, count]) => {
        const label = INTERVENTION_REASONS[reason];
        if (!label) return null;
        return count === 1 ? `Una vez, ${label}.` : `${count} veces, ${label}.`;
      })
      .filter((line): line is string => line !== null);
    mine.push(...reasons);
  }

  // -- Recomendaciones -----------------------------------------------------
  if (summary.dominant_failure) {
    const worst = summary.worst_measures[0] ?? null;
    const worstLabel = worst ? measureLabel(worst.measure) : "las notas";
    const consejos: Record<string, string> = {
      wrong: `Repasa ${worstLabel} nota a nota, bien lento, antes de tocarlo a tempo.`,
      timeout: `Cuenta en voz alta la entrada de ${worstLabel} antes de tocarla: más de un intento se perdió esperando la nota.`,
      miss: `Vuelve a ${worstLabel} con calma, buscando cada nota antes de meter el metrónomo.`,
    };
    recommend.push(
      consejos[summary.dominant_failure.outcome] ?? `Toca ${worstLabel} a tempo lento antes de subir el paso.`,
    );
    // Coherente con las intervenciones que ocurrieron: si bajé el tempo, recalco.
    if ((summary.interventions.by_action.slow_down ?? 0) > 0) {
      recommend.push(
        "Practica todavía un rato a ese tempo bajo y sube al 100% cuando la nota salga limpia.",
      );
    }
    if ((summary.interventions.by_action.offer_demo ?? 0) > 0) {
      recommend.push("Si dudas, vuelve a pedirme la demostración del compás que traba.");
    }
  } else {
    recommend.push("Sin fallos que corregir: el siguiente paso es apretar el metrónomo.");
  }

  const blocks: InterpretationBlock[] = [
    { heading: "Lo que salió bien", lines: good },
    { heading: "A mejorar", lines: improve },
    { heading: "Lo que hice yo", lines: mine },
    { heading: "Recomendaciones", lines: recommend },
  ].filter((block) => block.lines.length > 0);

  const lines = blocks.flatMap((block) => block.lines);
  return { hasPractice: true, lines, blocks };
}

/** Mensaje del turno efímero que pide la redacción al agente (B-033.4).
 *
 * Revisión del 2026-11-09 (petición del usuario): la redacción puede ser más
 * larga (la ventana maximizada es grande), en texto plano (los `**` no se
 * renderizan en la burbuja y llenan de astreira la lectura) y con el tono
 * cercano de las IA de chat populares, con algún emoji si ayuda. */
export function interpretationPrompt(): string {
  return (
    "Cuéntame cómo va mi práctica con detalle, como profesor hablándome: lo que " +
    "va bien, lo que hay que corregir y el paso siguiente, conectado en párrafos " +
    "cortos y tangibles (no lo dejes en dos líneas: la ventana es grande y hay " +
    "sitio). Escríbelo en texto plano, sin **asteriscos** ni títulos ni listas " +
    "con guiones: aquí el texto es plano y el markdown se leería tal cual y " +
    "afea. Si te ayuda, mete algún emoji (piano 🎹, dedo 👍, reloj ⏱) " +
    "sin pasarte. No inventes datos: todo lo que necesites está en los destacados."
  );
}

/** Contexto del turno efímero: los destacados ya traducidos, más lo que ya viajaba. */
export function interpretationContext(
  interpretation: Interpretation,
  extraContext: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...extraContext,
    destacados: interpretation.lines.join("\n"),
  };
}
