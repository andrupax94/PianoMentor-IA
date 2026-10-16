// description: Lista de piezas del catálogo con búsqueda, filtro y panel de detalle (B-027.3).
// context: Cliente; los datos llegan de GET /api/v1/pieces y se adaptan en src/lib/library.ts.
// El play de cada fila suena aquí mismo con el motor del piano (src/lib/usePlayback),
// sin navegar a Learn: el transporte de esta página es propio y muere al desmontarla.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getPieceList, getPieceNotes, type PieceNotesResponse } from "../../../lib/api-client";
import { paginate, toSongs, type Song } from "../../../lib/library";
import { previewStep } from "../../../lib/library-preview";
import { usePlayback } from "../../../lib/usePlayback";

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

  // Preview de la lista: mismo motor que el piano, pero transporte propio de la página.
  const preview = usePlayback();
  const { load, play, pause, status } = preview;
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Partituras ya pedidas en esta visita: repetir una fila no vuelve a llamar al backend.
  const scoresRef = useRef(new Map<string, PieceNotesResponse>());

  useEffect(() => {
    let active = true;
    // Solo el corpus: lo que se sube a mano suena en el piano y no entra aquí (B-027.3).
    getPieceList("corpus")
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

  /** Play/pausa de una fila: reproduce la pieza en la propia Library. */
  const handlePreview = useCallback(
    async (song: Song) => {
      const step = previewStep(previewId, song.id, status);
      if (step === "pause") {
        pause();
        return;
      }
      if (step === "resume") {
        void play().catch(() => undefined);
        return;
      }

      setPreviewError(null);
      setLoadingId(song.id);
      try {
        let score = scoresRef.current.get(song.id);
        if (!score) {
          score = await getPieceNotes(song.id);
          scoresRef.current.set(song.id, score);
        }
        load(score.notes, {
          tempo_bpm: score.tempo ?? undefined,
          duration_s: score.duration_seconds ?? undefined,
          measures: score.measures,
        });
        setPreviewId(song.id);
        // El gesto del clic desbloquea el AudioContext; si el navegador lo rechaza,
        // la pieza queda cargada y el botón sigue ahí para reintentar.
        void play().catch(() => undefined);
      } catch {
        setPreviewError("No se pudo cargar la pieza para escucharla. Comprueba el backend.");
      } finally {
        setLoadingId(null);
      }
    },
    [load, pause, play, previewId, status],
  );

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
              preview={{ id: previewId, playing: status === "playing", loadingId }}
              onPlay={handlePreview}
            />

            {previewError && (
              <p className={styles.notice} role="alert">
                {previewError}
              </p>
            )}

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
