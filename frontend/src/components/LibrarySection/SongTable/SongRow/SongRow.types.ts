import type { Difficulty, Song, SongStatus } from "../../LibraryPage/LibraryPage.types";

export interface SongRowProps {
  song: Song;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
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
