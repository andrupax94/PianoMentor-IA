# description: Acompañamiento determinista del agente (B-012.7): la IA toca una mano y el estudiante la otra.
# context: Filtra por mano (B-009.2) y recorta la sección de la rejilla (B-008); no usa LLM ni toca MIDI. build_accompaniment desplaza los tiempos al inicio de la sección y AccompanimentService resuelve sesión, pieza y compases con dependencias inyectadas; la API lo valida y lo difunde por WS, y el front decide si degrada a demostración por latencia.

"""Acompañamiento del agente (B-012.7).

El agente acompaña al estudiante: elige una mano (la izquierda por defecto), la
recorta a una sección de compases y la manda por WebSocket con tiempos
**relativos al inicio de la sección**, que es lo que necesita el navegador para
sonarla mientras el estudiante toca la otra mano.

El motor es puro y determinista: filtra las notas normalizadas por la mano que
decide `hand_by_track` (B-009.2), recorta la ventana que resuelve la rejilla de
B-008 y desplaza los tiempos al 0. No reproduce nada por sí mismo, no habla con
el LLM y no toca el reloj del navegador: solo prepara el plan que la API valida,
emite y difunde.

La sincronía fina es del cliente: si la latencia del WebSocket supera
`ACCOMPANY_MAX_RTT_MS`, el front pide al backend la acción `demonstrate` de la
misma sección en vez de acompañar (degradación graceful, B-012.7).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass

from .evaluation import piece_path, read_piece_notes, read_session
from .midi import HAND_LEFT, HAND_RIGHT, MeasureGrid, MidiParseError, MidiService, NormalizedNote, hand_by_track
from .validators import ValidationError

# Manos que admite la acción `accompany` (mismo enum que la validación B-012.4).
ACCOMPANY_HANDS = ("left", "right", "both")

# Latencia del WebSocket por encima de la cual el acompañamiento se degrada a
# demostración: por debajo, la IA y el estudiante pueden sonar juntos.
ACCOMPANY_MAX_RTT_MS = 50.0

# Compases que acompañan por defecto cuando la acción no pide sección.
DEFAULT_ACCOMPANY_MEASURES = 4


@dataclass(frozen=True)
class AccompanimentNote:
    """Nota del acompañamiento con el tiempo relativo al inicio de la sección."""

    pitch: int
    start_s: float
    duration_s: float
    velocity: int

    def as_dict(self) -> dict[str, object]:
        """Forma que viaja por WebSocket (JSON, sin decimales de ruido)."""
        return {
            "pitch": self.pitch,
            "start_s": round(self.start_s, 3),
            "duration_s": round(self.duration_s, 3),
            "velocity": self.velocity,
        }


@dataclass(frozen=True)
class Accompaniment:
    """Plan de acompañamiento listo para validar, emitir y difundir."""

    hand: str
    student_hand: str | None
    from_measure: int
    to_measure: int
    from_s: float
    to_s: float
    duration_s: float
    tempo_factor: float
    notes: tuple[AccompanimentNote, ...]

    def as_payload(self) -> dict[str, object]:
        """Sobre `agent_action` del acompañamiento: ventana, mano y notas."""
        return {
            "hand": self.hand,
            "student_hand": self.student_hand,
            "from_measure": self.from_measure,
            "to_measure": self.to_measure,
            "from_s": round(self.from_s, 3),
            "duration_s": round(self.duration_s, 3),
            "tempo_factor": self.tempo_factor,
            "notes": [note.as_dict() for note in self.notes],
        }


def student_hand_for(hand: str) -> str | None:
    """La mano que le queda al estudiante cuando la IA toca `hand`."""
    if hand == "left":
        return "right"
    if hand == "right":
        return "left"
    return None


def build_accompaniment(
    notes: Sequence[NormalizedNote],
    hand: str,
    *,
    from_s: float,
    to_s: float,
    from_measure: int,
    to_measure: int,
    tempo_factor: float = 1.0,
) -> Accompaniment:
    """Recorta la mano elegida a la sección y desplaza sus tiempos al 0.

    - La mano sale de la pista de cada nota (`hand_by_track`, B-009.2); una
      pista `unknown` no se puede ofrecer como acompañamiento.
    - `both` entrega la pieza entera de la sección (la IA toca las dos manos).
    - Sin notas de esa mano en la ventana se rechaza con `action_not_allowed_now`:
      acompañar con silencio no es acompañar.
    """
    if hand not in ACCOMPANY_HANDS:
        raise ValidationError(
            "action_params_out_of_range",
            f"hand debe ser uno de {list(ACCOMPANY_HANDS)} (recibido: {hand!r})",
        )
    if to_s <= from_s:
        raise ValidationError(
            "invalid_measure_range", f"La sección no avanza: {from_s} s → {to_s} s"
        )

    hands = hand_by_track(notes)
    wanted = {"left": HAND_LEFT, "right": HAND_RIGHT}.get(hand)

    selected = [
        note
        for note in notes
        if from_s <= note.start_seconds < to_s
        and (wanted is None or hands.get(note.track) == wanted)
    ]
    if not selected:
        raise ValidationError(
            "action_not_allowed_now",
            f"La mano {hand!r} no tiene notas en los compases {from_measure + 1}–{to_measure}",
        )

    ordered = sorted(selected, key=lambda note: (note.start_seconds, note.pitch))
    return Accompaniment(
        hand=hand,
        student_hand=student_hand_for(hand),
        from_measure=from_measure,
        to_measure=to_measure,
        from_s=from_s,
        to_s=to_s,
        duration_s=to_s - from_s,
        tempo_factor=tempo_factor,
        notes=tuple(
            AccompanimentNote(
                pitch=note.pitch,
                start_s=note.start_seconds - from_s,
                duration_s=note.duration_seconds,
                velocity=note.velocity,
            )
            for note in ordered
        ),
    )


def current_measure_of(session: Mapping[str, object]) -> int:
    """Compás actual de la sesión, con la fila de SQLite o con un dict.

    `read_session` devuelve un `sqlite3.Row`, que responde a `session["campo"]`
    pero **no** tiene `.get()`: leerlo como diccionario reventaba el
    acompañamiento cuando la acción no pedía compases (B-012.7).
    """
    try:
        value = session["current_measure"]
    except (IndexError, KeyError):
        return 0
    return int(value or 0)


def read_piece_grid(row: Mapping[str, object]) -> MeasureGrid:
    """Rejilla de compases de la pieza de la sesión (B-008)."""
    try:
        return MidiService().measure_grid(piece_path(row))
    except MidiParseError as exc:
        raise ValidationError(exc.code, exc.message) from exc


class AccompanimentService:
    """Caso de uso B-012.7: plan de acompañamiento de una sesión.

    Resuelve sesión, pieza y sección, y delega el recorte en
    `build_accompaniment`. Las dependencias van inyectadas, igual que en
    `EvaluationService`, para que los tests no toquen SQLite ni el disco.
    """

    def __init__(
        self,
        *,
        session_reader: Callable[[str], Mapping[str, object]] | None = None,
        piece_lookup: Callable[[str], object] | None = None,
        note_reader: Callable[[Mapping[str, object]], list[NormalizedNote]] | None = None,
        grid_reader: Callable[[Mapping[str, object]], MeasureGrid] | None = None,
    ) -> None:
        self._session_reader = session_reader or read_session
        self._piece_lookup = piece_lookup
        self._note_reader = note_reader or read_piece_notes
        self._grid_reader = grid_reader or read_piece_grid

    def plan(
        self,
        session_id: str,
        *,
        hand: str = "left",
        from_measure: int | None = None,
        to_measure: int | None = None,
        tempo_factor: float = 1.0,
    ) -> Accompaniment:
        """Plan de acompañamiento de la sesión; lanza `ValidationError` si no procede.

        Sin sección explícita acompaña desde el compás actual de la sesión y
        recorta al final de la pieza, para que una acción del LLM sin compases
        siga siendo ejecutable.
        """
        session = self._session_reader(session_id)
        row = (self._piece_lookup or _default_piece_lookup)(str(session["piece_id"]))
        if row is None:
            raise ValidationError(
                "piece_not_found", f"No existe la pieza: {session['piece_id']}"
            )

        grid = self._grid_reader(row)  # type: ignore[arg-type]
        if grid.count == 0:
            raise ValidationError("measure_grid_empty", "La pieza no tiene compases")

        start = current_measure_of(session) if from_measure is None else from_measure
        # La sección por defecto se recorta al final de la pieza; una sección
        # explícita fuera de límites es un error de la acción y se rechaza.
        if to_measure is None:
            end = min(start + DEFAULT_ACCOMPANY_MEASURES, grid.count)
        else:
            end = to_measure

        try:
            from_s, to_s = grid.resolve_range(start, end)
        except MidiParseError as exc:
            raise ValidationError(exc.code, exc.message) from exc

        return build_accompaniment(
            self._note_reader(row),  # type: ignore[arg-type]
            hand,
            from_s=from_s,
            to_s=to_s,
            from_measure=start,
            to_measure=end,
            tempo_factor=tempo_factor,
        )


def _default_piece_lookup(piece_id: str) -> object:
    """Lectura de la pieza desde SQLite (import local: evita un ciclo con api)."""
    from . import database

    return database.find_piece_by_id(piece_id)
