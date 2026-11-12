"use client";

import { useEffect, useState } from "react";
import { DOC_ENTRIES, findDoc } from "../../lib/docs-registry";
import type { DocEntry } from "../../lib/docs-registry";
import { markdownToHtml } from "../../lib/markdown";

/** Nombres de icono de Material Symbols (los mismos que usa el HTML de Stitch). */
const DOC_ICONS: Record<string, string> = {
  terminos: "gavel",
  privacidad: "security",
  readme: "description",
  product: "inventory_2",
  glossary: "dictionary",
  design: "palette",
  "getting-started": "play_circle",
  troubleshooting: "build",
  "third-party": "favorite",
};

function groupEntries(entries: DocEntry[]) {
  return entries.reduce<Record<string, DocEntry[]>>((acc, entry) => {
    acc[entry.group] = acc[entry.group] || [];
    acc[entry.group].push(entry);
    return acc;
  }, {});
}

export function Documentation({ initialSlug }: { initialSlug?: string } = {}) {
  const [activeSlug, setActiveSlug] = useState(initialSlug || DOC_ENTRIES[0].slug);
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const active = findDoc(activeSlug) || DOC_ENTRIES[0];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(active.path)
      .then((res) => {
        if (!res.ok) throw new Error(`No se pudo cargar ${active.path}`);
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        setHtml(markdownToHtml(text));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Error al cargar el documento");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active.path]);

  const groups = groupEntries(DOC_ENTRIES);

  return (
    <main className="w-full flex-1 flex flex-col md:flex-row">
      {/* LEFT SIDEBAR NAVIGATION */}
      <aside className="w-full md:w-72 lg:w-80 flex-shrink-0 bg-surface-container-lowest border-r border-outline-variant/30 flex flex-col p-6 md:sticky md:top-[76px] md:h-[calc(100vh-76px)] overflow-y-auto">
        {/* Documentation Context Indicator */}
        <div className="mb-7 pb-5 border-b border-outline-variant/30">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[18px]">menu_book</span>
            </div>
            <div>
              <span className="text-xs font-semibold tracking-wider uppercase text-primary/90 block">
                Documentación
              </span>
              <span className="text-sm font-bold text-on-surface">PianoMentor AI</span>
            </div>
          </div>
        </div>

        <nav className="space-y-7 flex-1" aria-label="Navegación de Documentación">
          {Object.entries(groups).map(([group, entries]) => (
            <div key={group}>
              <div className="flex items-center justify-between mb-3 px-3">
                <h3 className="text-[11px] font-bold tracking-widest uppercase text-on-surface-variant/80">
                  {group}
                </h3>
                <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                  {entries.length}
                </span>
              </div>
              <ul className="space-y-1">
                {entries.map((entry) => {
                  const isActive = entry.slug === activeSlug;
                  return (
                    <li key={entry.slug}>
                      <button
                        type="button"
                        onClick={() => setActiveSlug(entry.slug)}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex items-center gap-3 w-full text-left px-3.5 py-2.5 text-sm transition-all ${
                          isActive
                            ? "rounded-r-lg font-semibold text-primary bg-primary/10 border-l-[3px] border-primary shadow-sm shadow-primary/5"
                            : "rounded-lg bg-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container border-l-[3px] border-transparent"
                        }`}
                      >
                        <span
                          className={`material-symbols-outlined text-[18px] flex-shrink-0 ${
                            isActive ? "text-primary" : "text-on-surface-variant"
                          }`}
                        >
                          {DOC_ICONS[entry.slug] ?? "description"}
                        </span>
                        <span className={isActive ? "font-semibold" : "font-medium"}>
                          {entry.title}
                        </span>
                        {isActive && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Sidebar Status Chip */}
        <div className="mt-8 pt-4 border-t border-outline-variant/30 flex items-center justify-between text-xs text-on-surface-variant">
          <span className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Docs
          </span>
          <span className="text-[11px] font-mono text-primary/80">v1.0</span>
        </div>
      </aside>

      {/* MAIN CONTENT PANEL */}
      <section className="flex-1 bg-surface px-6 py-8 md:px-12 md:py-12 lg:px-16 overflow-y-auto max-w-5xl">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-xs font-medium text-on-surface-variant mb-6">
          <span>{active.group}</span>
          <span className="text-on-surface-variant/40">/</span>
          <span className="text-primary font-semibold">{active.title}</span>
        </div>

        {/* Document Header & Title */}
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-semibold mb-4">
            <span className="material-symbols-outlined text-[14px]">menu_book</span>
            <span>{active.group}</span>
          </div>
          {/* H1 compacto a petición del usuario (20/24/30px). Con la regla
              global de globals.css eliminada, las utilidades Tailwind aplican
              sin necesidad de `!`. */}
          <h1 className="text-xl md:text-2xl lg:text-3xl max-w-none my-0 font-extrabold text-white tracking-tight leading-tight">
            {active.title}
          </h1>
          <div className="mt-4 h-1 w-24 bg-gradient-to-r from-primary via-secondary to-transparent rounded-full" />
          <div className="flex flex-wrap items-center gap-y-2 gap-x-6 mt-5 text-xs text-on-surface-variant border-b border-outline-variant/30 pb-5">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary">schedule</span>
              {loading ? "Cargando…" : "Documento"}
            </span>
            <span className="flex items-center gap-1.5 font-mono">
              <span className="material-symbols-outlined text-[16px] text-primary">description</span>
              {active.path}
            </span>
          </div>
        </header>

        {/* Document Body */}
        {loading && <p className="text-on-surface/85">Cargando…</p>}
        {error && <p className="text-error">{error}</p>}
        {!loading && !error && (
          <article
            className="space-y-4 text-on-surface"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </section>
    </main>
  );
}
