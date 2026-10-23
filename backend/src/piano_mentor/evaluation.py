# description: Evaluador determinista: notas correctas, omitidas, extras, precisión y timing.
# context: Mide la interpretación sin LLM ni UI (B-012.2).

"""Evaluación determinista de una interpretación contra la partitura."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

from . import database
from .config import settings
from .midi import MidiParseError, MidiService, NormalizedNote, group_chords
from .storage import LocalPieceStorage
from .validators import ValidationError

# Tolerancia por nota (B-012.2): 100 ms es más fino de lo que el oído juzga
# como "a tiempo" y más laxo que cualquier teclado físico.
DEFAULT_TOLERANCE_MS = 100
MIN_TOLERANCE_MS = 1
MAX_TOLERANCE_MS = 1000

# Ventana de detección: más allá de la tolerancia pero dentro de este margen la
# nota se sigue reconociendo (como `early`/`late`) en vez de convertirse en dos
# fallos (`omitted` + `extra`). 500 ms cubre el error típico de frase mal contada.
DETECTION_WINDOW_S = 0.5

STATUS_CORRECT = "correct"
STATUS_EARLY = "early"
STATUS_LATE = "late"
STATUS_WRONG_PITCH = "wrong_pitch"
STATUS_OMITTED = "omitted"
STATUS_EXTRA = "extra"

# Pesos del `score_total`: un error de tecla pesa más que un error de tiempo.
NOTES_WEIGHT = 0.7
TIMING_WEIGHT = 0.3
OUT_OF_TIME_VALUE = 0.5  # la tecla es correcta; solo va mal de tiempo
EXTRA_PENALTY = 2.0  # puntos que resta cada nota de más
EXTRA_PENALTY_LIMIT = 5  # cuántas notas de más penalizan como máximo

ROUNDING = 4
MS_ROUNDING = 2


def _tolerance_windows(tolerance_ms: int) -> tuple[float, float]:
    """Valida la tolerancia y devuelve (tolerancia, ventana de detección) en s."""
    if isinstance(tolerance_ms, bool) or not isinstance(tolerance_ms, int):
        raise ValidationError("invalid_tolerance", "`tolerance_ms` debe ser un entero")
    if not MIN_TOLERANCE_MS <= tolerance_ms <= MAX_TOLERANCE_MS:
        raise ValidationError(
            "invalid_tolerance",
            f"`tolerance_ms` debe estar entre {MIN_TOLERANCE_MS} y {MAX_TOLERANCE_MS}",
        )
    tolerance_s = tolerance_ms / 1000.0
    return tolerance_s, max(tolerance_s, DETECTION_WINDOW_S)


def _expected_units(expected: Sequence[NormalizedNote]) -> list[tuple[float, tuple[int, ...]]]:
    """Agrupa la partitura en unidades comparables: acordes de B-009.

    Una altura repetida por dos pistas cuenta una sola vez: si el estudiante
    pulsa esa tecla, el sonido es el correcto aunque la partitura la tenga doble.
    """
    return [
        (chord.start_seconds, tuple(sorted({note.pitch for note in chord.notes})))
        for chord in group_chords(expected)
    ]


def _received_notes(received: Sequence[Mapping[str, object]]) -> list[tuple[int, float]]:
    """Notas pulsadas: solo los `note_on`, ya que el acierto se mide al atacar."""
    notes: list[tuple[int, float]] = []
    for event in received:
        if event.get("type") != "note_on":
            continue
        notes.append((int(event["pitch"]), float(event["t_s"])))
    return sorted(notes)


def _closest_note(
    available: set[int],
    notes: Sequence[tuple[int, float]],
    anchor: float,
    max_seconds: float,
    pitch: int | None,
    min_seconds: float | None = None,
) -> int | None:
    """Índice del evento más cercano al ancla dentro de la ventana, o None.

    El desempate es por distancia y después por instante: dos candidatos igual
    de buenos siempre se resuelven igual, sea cual sea el orden de llegada.
    """
    best: tuple[float, float, int] | None = None
    for index in available:
        note_pitch, t_s = notes[index]
        if pitch is not None and note_pitch != pitch:
            continue
        distance = abs(t_s - anchor)
        if distance > max_seconds:
            continue
        if min_seconds is not None and distance <= min_seconds:
            continue
        candidate = (distance, t_s, index)
        if best is None or candidate < best:
            best = candidate
    return best[2] if best else None


@dataclass
class _UnitMatch:
    """Resultado de comparar una unidad esperada (nota o acorde) con lo tocado."""

    status: str
    received_pitches: list[int]
    deviations_ms: list[float]

    @property
    def deviation_ms(self) -> float | None:
        """Desviación media de la unidad; None si no sonó nada de lo esperado."""
        if not self.deviations_ms:
            return None
        return round(sum(self.deviations_ms) / len(self.deviations_ms), MS_ROUNDING)


def _match_unit(
    start_seconds: float,
    pitches: tuple[int, ...],
    notes: Sequence[tuple[int, float]],
    available: set[int],
    tolerance_s: float,
    detection_s: float,
) -> _UnitMatch:
    """Asigna los eventos a una unidad en tres pasadas, de más fiable a menos.

    1. Misma altura dentro de la tolerancia → la nota está a tiempo.
    2. Misma altura fuera de la tolerancia pero en la ventana de detección →
       la tecla es correcta y el fallo es de tiempo (`early`/`late`).
    3. Cualquier altura en la ventana de tolerancia → momento correcto, tecla
       equivocada (`wrong_pitch`); el evento se consume para no contarlo además
       como `extra`.
    """
    remaining = list(pitches)
    received_pitches: list[int] = []
    deviations_ms: list[float] = []
    wrong_pitch = False
    out_of_time = False

    for pitch in list(remaining):
        index = _closest_note(available, notes, start_seconds, tolerance_s, pitch)
        if index is None:
            continue
        available.discard(index)
        remaining.remove(pitch)
        received_pitches.append(notes[index][0])
        deviations_ms.append((notes[index][1] - start_seconds) * 1000)

    for pitch in list(remaining):
        index = _closest_note(
            available, notes, start_seconds, detection_s, pitch, min_seconds=tolerance_s
        )
        if index is None:
            continue
        available.discard(index)
        remaining.remove(pitch)
        received_pitches.append(notes[index][0])
        deviations_ms.append((notes[index][1] - start_seconds) * 1000)
        out_of_time = True

    for pitch in list(remaining):
        index = _closest_note(available, notes, start_seconds, tolerance_s, pitch=None)
        if index is None:
            continue
        available.discard(index)
        remaining.remove(pitch)
        received_pitches.append(notes[index][0])
        wrong_pitch = True

    if remaining:
        status = STATUS_OMITTED
    elif wrong_pitch:
        status = STATUS_WRONG_PITCH
    elif out_of_time and sum(deviations_ms) < 0:
        status = STATUS_EARLY
    elif out_of_time:
        status = STATUS_LATE
    else:
        status = STATUS_CORRECT
    return _UnitMatch(status=status, received_pitches=received_pitches, deviations_ms=deviations_ms)


def _mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else 0.0


class PerformanceEvaluator:
    """Compara partitura e interpretación, acorde contra acorde (B-012.2).

    Determinista y sin estado: mismas entradas, mismo resultado, sin importar en
    qué orden llegó el estudiante a tocar (los eventos se ordenan antes de
    comparar). No toca la base de datos, la reproducción ni el LLM.
    """

    def evaluate(
        self,
        expected: Sequence[NormalizedNote],
        received: Sequence[Mapping[str, object]],
        tolerance_ms: int = DEFAULT_TOLERANCE_MS,
        extras_window: tuple[float | None, float | None] | None = None,
    ) -> dict[str, object]:
        """Devuelve el detalle por nota y el resumen de la interpretación.

        `expected` son las notas normalizadas de la partitura y `received` los
        eventos de sesión; solo los ataques (`note_on`) puntúan, porque el
        acierto se mide al pulsar, no al soltar.

        `extras_window` acota qué sobras cuentan como `extra`: útil cuando la
        evaluación mira solo un trozo de la pieza, porque tocar más allá de la
        ventana pedida no es un error del estudiante.
        """
        tolerance_s, detection_s = _tolerance_windows(tolerance_ms)
        units = _expected_units(expected)
        notes = _received_notes(received)

        available = set(range(len(notes)))
        matches = [
            _match_unit(start, pitches, notes, available, tolerance_s, detection_s)
            for start, pitches in units
        ]

        counts = {
            status: 0
            for status in (
                STATUS_CORRECT,
                STATUS_EARLY,
                STATUS_LATE,
                STATUS_WRONG_PITCH,
                STATUS_OMITTED,
            )
        }
        for match in matches:
            counts[match.status] += 1
        extras = [
            notes[index]
            for index in sorted(available)
            if _within_window(notes[index][1], extras_window)
        ]
        counts[STATUS_EXTRA] = len(extras)

        expected_total = len(units)
        correct = counts[STATUS_CORRECT]
        out_of_time = counts[STATUS_EARLY] + counts[STATUS_LATE]
        if expected_total:
            notes_score = (correct + OUT_OF_TIME_VALUE * out_of_time) / expected_total
            accuracy_pct = 100.0 * correct / expected_total
        else:
            notes_score = 0.0
            accuracy_pct = 0.0

        deviations_ms = [value for match in matches for value in match.deviations_ms]
        timing_ms = abs(_mean(deviations_ms)) if deviations_ms else 0.0
        timing_score = max(0.0, 1.0 - timing_ms / (tolerance_ms)) if deviations_ms else 0.0
        score_total = 100.0 * (NOTES_WEIGHT * notes_score + TIMING_WEIGHT * timing_score)
        score_total -= EXTRA_PENALTY * min(counts[STATUS_EXTRA], EXTRA_PENALTY_LIMIT)

        return {
            "status": "computed",
            "tolerance_ms": tolerance_ms,
            "expected_total": expected_total,
            "received_total": len(notes),
            "counts": counts,
            "notes_score": round(notes_score, ROUNDING),
            "timing_score": round(timing_score, ROUNDING),
            "accuracy_pct": round(accuracy_pct, ROUNDING),
            "timing_ms": round(timing_ms, MS_ROUNDING),
            "drift_ms": round(_mean(deviations_ms), MS_ROUNDING),
            "score_total": round(max(score_total, 0.0), 1),
            "notes": [
                {
                    "start_seconds": start,
                    "expected_pitches": list(pitches),
                    "status": match.status,
                    "received_pitches": match.received_pitches,
                    "deviation_ms": match.deviation_ms,
                }
                for (start, pitches), match in zip(units, matches, strict=True)
            ],
            "extras": [
                {"pitch": pitch, "t_s": t_s, "status": STATUS_EXTRA} for pitch, t_s in extras
            ],
        }


def _within_window(t_s: float, window: tuple[float | None, float | None] | None) -> bool:
    """True si el instante cae en la ventana (o si no hay ventana)."""
    if window is None:
        return True
    from_s, to_s = window
    return (from_s is None or t_s >= from_s) and (to_s is None or t_s <= to_s)


def read_session(session_id: str) -> Mapping[str, object]:
    """Lee la sesión o lanza `session_not_found` (dependencia por defecto)."""
    with database.open_db() as conn:
        row = database.get_session(conn, session_id)
    if row is None:
        raise ValidationError("session_not_found", f"No existe la sesión: {session_id}")
    return row


def read_session_events(session_id: str) -> list[Mapping[str, object]]:
    """Log de eventos de la sesión: lo que el estudiante llegó a tocar."""
    with database.open_db() as conn:
        return [dict(event) for event in database.list_session_events(conn, session_id)]


def piece_path(row: Mapping[str, object]) -> Path:
    """Ruta del MIDI de una pieza: el del corpus o el subido, según su fila."""
    if row["midi_path"]:
        return Path(settings.midi_storage_path) / row["midi_path"]
    return LocalPieceStorage(Path(settings.midi_storage_path)).get_path(row["stored_filename"])


def read_piece_notes(row: Mapping[str, object]) -> list[NormalizedNote]:
    """Notas normalizadas de la pieza; el archivo ilegible es error del cliente."""
    try:
        return MidiService().normalize(piece_path(row))
    except MidiParseError as exc:
        raise ValidationError("piece_file_not_found", exc.message) from exc


def resolve_measure_window(
    row: Mapping[str, object], from_measure: int, to_measure: int
) -> tuple[float, float]:
    """Traduce un rango de compases a segundos con la rejilla de B-008."""
    try:
        resolved = MidiService().resolve_measure_range(piece_path(row), from_measure, to_measure)
    except MidiParseError as exc:
        raise ValidationError(exc.code, exc.message) from exc
    from_s, to_s = resolved["window"]
    return float(from_s), float(to_s)


class EvaluationService:
    """Caso de uso B-012.2: evaluar la sesión de práctica contra su pieza.

    Resuelve sesión, pieza, ventana y log de eventos, y delega la comparación en
    `PerformanceEvaluator`. Las dependencias van inyectadas (al estilo de
    `PracticeService`) para que los tests puedan sustituirlas.
    """

    def __init__(
        self,
        *,
        session_reader: Callable[[str], Mapping[str, object]] | None = None,
        piece_lookup: Callable[[str], object] | None = None,
        event_reader: Callable[[str], list[Mapping[str, object]]] | None = None,
        note_reader: Callable[[Mapping[str, object]], list[NormalizedNote]] | None = None,
        window_resolver: Callable[[Mapping[str, object], int, int], tuple[float, float]]
        | None = None,
        evaluator: PerformanceEvaluator | None = None,
    ) -> None:
        self._session_reader = session_reader or read_session
        self._piece_lookup = piece_lookup or database.find_piece_by_id
        self._event_reader = event_reader or read_session_events
        self._note_reader = note_reader or read_piece_notes
        self._window_resolver = window_resolver or resolve_measure_window
        self._evaluator = evaluator or PerformanceEvaluator()

    def evaluate(
        self,
        session_id: str,
        *,
        from_s: float | None = None,
        to_s: float | None = None,
        from_measure: int | None = None,
        to_measure: int | None = None,
        tolerance_ms: int = DEFAULT_TOLERANCE_MS,
    ) -> dict[str, object]:
        """Evalúa lo registrado en la sesión; ventana opcional por s o compases."""
        # Valida la tolerancia antes de tocar la base de datos: un valor fuera
        # de rango es error del cliente, no un 404 disfrazado.
        _, detection_s = _tolerance_windows(tolerance_ms)

        session = self._session_reader(session_id)
        row = self._piece_lookup(str(session["piece_id"]))
        if row is None:
            raise ValidationError("piece_not_found", f"No existe la pieza: {session['piece_id']}")
        window = self._resolve_window(row, from_s, to_s, from_measure, to_measure)

        notes = self._note_reader(row)
        expected = _filter_expected(notes, window)
        received = _filter_received(self._event_reader(session_id), window, detection_s)

        result = self._evaluator.evaluate(expected, received, tolerance_ms, extras_window=window)
        result.update(
            session_id=session_id,
            piece_id=row["id"],
            from_s=window[0],
            to_s=window[1],
        )
        return result

    def _resolve_window(
        self,
        row: Mapping[str, object],
        from_s: float | None,
        to_s: float | None,
        from_measure: int | None,
        to_measure: int | None,
    ) -> tuple[float | None, float | None]:
        """Ventana temporal de la evaluación, en segundos o por compases."""
        if from_measure is not None or to_measure is not None:
            if from_measure is None or to_measure is None:
                raise ValidationError(
                    "invalid_measure_range", "from_measure y to_measure deben ir juntos"
                )
            if from_measure >= to_measure:
                raise ValidationError("invalid_measure_range", "from_measure debe ser < to_measure")
            if from_s is not None or to_s is not None:
                raise ValidationError(
                    "invalid_window",
                    "Usa from_s/to_s o from_measure/to_measure, no ambas a la vez",
                )
            return self._window_resolver(row, from_measure, to_measure)

        if (
            (from_s is not None and from_s < 0)
            or (to_s is not None and to_s < 0)
            or (from_s is not None and to_s is not None and from_s > to_s)
        ):
            raise ValidationError("invalid_window", "from_s/to_s deben ser >= 0 y from_s <= to_s")
        return from_s, to_s


def _filter_expected(
    notes: Sequence[NormalizedNote], window: tuple[float | None, float | None]
) -> list[NormalizedNote]:
    """Notas de la partitura que caen en la ventana pedida."""
    from_s, to_s = window
    return [
        note
        for note in notes
        if (from_s is None or note.start_seconds >= from_s)
        and (to_s is None or note.start_seconds <= to_s)
    ]


def _filter_received(
    events: Sequence[Mapping[str, object]],
    window: tuple[float | None, float | None],
    detection_s: float,
) -> list[Mapping[str, object]]:
    """Eventos de la sesión, con un margen de `detection_s` en los bordes.

    El margen evita perder un `note_on` ligeramente anterior al inicio de la
    ventana, que es justo la nota que hay que reconocer como `early`.
    """
    from_s, to_s = window
    return [
        event
        for event in events
        if (from_s is None or float(event["t_s"]) >= from_s - detection_s)
        and (to_s is None or float(event["t_s"]) <= to_s + detection_s)
    ]
