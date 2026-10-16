import type { Song } from "../LibraryPage/LibraryPage.types";

export interface SongTableProps {
  songs: Song[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}
