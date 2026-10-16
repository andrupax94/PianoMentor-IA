import type {
  Difficulty,
  PreviewState,
  Song,
  SongStatus,
} from "../../LibraryPage/LibraryPage.types";

export interface SongRowProps {
  song: Song;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
  /** Estado del preview de la Library (qué suena y qué se está cargando). */
  preview: PreviewState;
  /** Reproduce o pausa esta fila sin salir de la lista. */
  onPlay: (song: Song) => void;
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: "Principiante",
  intermediate: "Intermedio",
  advanced: "Avanzado",
};

export const STATUS_LABEL: Record<SongStatus, string> = {
  new: "Nueva",
  "in-progress": "En progreso",
  mastered: "Dominada",
};
