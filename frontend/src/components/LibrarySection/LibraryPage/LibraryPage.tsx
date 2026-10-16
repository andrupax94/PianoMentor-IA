// description: Lista de piezas del catálogo con búsqueda, filtro y panel de detalle (B-027.3).
// context: Cliente; los datos llegan de GET /api/v1/pieces y se adaptan en src/lib/library.ts.

"use client";

import { useEffect, useMemo, useState } from "react";

import { getPieceList } from "../../../lib/api-client";
import { paginate, toSongs, type Song } from "../../../lib/library";

import { LibraryToolbar } from "../LibraryToolbar/LibraryToolbar";
import { SongDetailPanel } from "../SongDetailPanel/SongDetailPanel";
import { SongTable } from "../SongTable/SongTable";
import { TablePagination } from "../TablePagination/TablePagination";
import type { SongFilter } from "./LibraryPage.types";
import styles from "./LibraryPage.module.css";

/** Piezas por página en la tabla. */
const PAGE_SIZE = 10;

type LoadState = "loading" | "ready" | "error";

export function LibraryPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SongFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    getPieceList()
      .then((items) => {
        if (!active) return;
        const loaded = toSongs(items);
        setSongs(loaded);
        setSelectedId((current) => current ?? loaded[0]?.id ?? null);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleSongs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return songs.filter((song) => {
      const matchesFilter = filter === "all" || song.status === filter;
      const matchesQuery =
        !q || song.title.toLowerCase().includes(q) || song.composer.toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [songs, query, filter]);

  // Cambiar la búsqueda o el filtro devuelve a la primera página.
  useEffect(() => {
    setPage(1);
  }, [query, filter]);

  const current = paginate(visibleSongs, page, PAGE_SIZE);
  const selectedSong = songs.find((song) => song.id === selectedId) ?? null;
  const mastered = songs.filter((song) => song.status === "mastered").length;
  const inProgress = songs.filter((song) => song.status === "in-progress").length;

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>Library</h1>
        <p className={styles.subtitle}>
          {songs.length} canciones · {mastered} dominadas · {inProgress} en progreso
        </p>

        <LibraryToolbar
          query={query}
          filter={filter}
          onQueryChange={setQuery}
          onFilterChange={setFilter}
        />

        {state === "loading" && (
          <p className={styles.notice} role="status">
            Cargando catálogo…
          </p>
        )}

        {state === "error" && (
          <p className={styles.notice} role="alert">
            No se pudo cargar el catálogo. Comprueba que el backend está en marcha.
          </p>
        )}

        {state === "ready" && (
          <>
            <SongTable
              songs={current.items}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />

            <TablePagination
              page={current.page}
              totalPages={current.totalPages}
              shown={current.items.length}
              total={visibleSongs.length}
              onPageChange={setPage}
            />
          </>
        )}
      </section>

      <SongDetailPanel song={selectedSong} />
    </div>
  );
}
