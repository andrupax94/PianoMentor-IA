"use client";
// description: Subcontenedor de pestañas del mentor: Carga pieza y Rendimiento.
// context: Agrupa MidiUploader y PerformanceStats en pestañas con icono.
// Cualquier componente puede pedir un cambio de pestaña con switchMentorTab().
// B-032.10: el hospedador elige qué pestañas existen — solo «Carga pieza» sin
// sesión y solo «Rendimiento» con ella; una petición de pestaña oculta se ignora.

import { useCallback, useEffect, useState } from "react";

import { MidiUploader } from "../../MidiUploader";
import { PerformanceStats } from "../PerformanceStats/PerformanceStats";
import { mentorTabEvents, switchMentorTab, type MentorTabId } from "../../../lib/mentor-tab-events";
import styles from "./MentorTabs.module.css";
import type { MentorTabsProps } from "./MentorTabs.types";

const TABS: { id: MentorTabId; label: string; icon: string }[] = [
  { id: "carga", label: "Carga pieza", icon: "/assets/icons/midi.svg" },
  { id: "rendimiento", label: "Rendimiento", icon: "/assets/icons/metrics.svg" },
];

const DEFAULT_TABS: MentorTabId[] = ["carga", "rendimiento"];

export function MentorTabs({ weakPoint = "Transición de mano izquierda", visibleTabs = DEFAULT_TABS }: MentorTabsProps) {
  const available = TABS.filter((tab) => visibleTabs.includes(tab.id));
  const [activeTab, setActiveTab] = useState<MentorTabId>(available[0]?.id ?? "carga");

  // Escucha peticiones de cambio de pestaña desde cualquier componente; una
  // petición hacia una pestaña oculta no cambia nada (no existe hoy).
  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ tab: MentorTabId }>;
      if (!available.some((tab) => tab.id === custom.detail.tab)) return;
      setActiveTab(custom.detail.tab);
    };
    mentorTabEvents.addEventListener("mentor:switch-tab", handler as EventListener);
    return () => mentorTabEvents.removeEventListener("mentor:switch-tab", handler as EventListener);
    // `available` deriva de visibleTabs: esta lista es la dependencia real.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTabs]);

  // Si el conjunto de pestañas cambia (se abre o cierra la sesión) la activa
  // vuelve a la primera visible para no quedar en una que ya no existe.
  useEffect(() => {
    if (!available.some((tab) => tab.id === activeTab)) {
      setActiveTab(available[0]?.id ?? "carga");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTabs]);

  const goTo = useCallback((tab: MentorTabId) => {
    switchMentorTab(tab);
  }, []);

  return (
    <section className={styles.tabs}>
      <nav className={styles.tablist} role="tablist" aria-label="Pestañas del mentor">
        {available.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`mentor-tabpanel-${tab.id}`}
              className={`${styles.tab} ${active ? styles.tabActive : ""}`}
              onClick={() => goTo(tab.id)}
            >
              <img src={tab.icon} alt="" className={styles.tabIcon} aria-hidden="true" />
              <span className={styles.tabLabel}>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div className={styles.tabpanels}>
        {available.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <div
              key={tab.id}
              role="tabpanel"
              id={`mentor-tabpanel-${tab.id}`}
              hidden={!active}
              style={{ display: active ? undefined : "none" }}
              className={styles.tabpanel}
            >
              {tab.id === "carga" && <MidiUploader />}
              {tab.id === "rendimiento" && (
                <PerformanceStats />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
