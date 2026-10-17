"use client";
// description: Subcontenedor de pestañas del mentor: Carga pieza, Estado de sesión y Rendimiento.
// context: Agrupa MidiUploader, SessionStatus y PerformanceStats en pestañas con icono.
// Cualquier componente puede pedir un cambio de pestaña con switchMentorTab().

import { useCallback, useEffect, useState } from "react";

import { MidiUploader } from "../../MidiUploader";
import { SessionStatus } from "../../SessionStatus";
import { PerformanceStats } from "../PerformanceStats/PerformanceStats";
import { mentorTabEvents, switchMentorTab, type MentorTabId } from "../../../lib/mentor-tab-events";
import styles from "./MentorTabs.module.css";
import type { MentorTabsProps } from "./MentorTabs.types";

const TABS: { id: MentorTabId; label: string; icon: string }[] = [
  { id: "carga", label: "Carga pieza", icon: "/assets/icons/piano.svg" },
  { id: "sesion", label: "Estado de sesión", icon: "/assets/icons/info.svg" },
  { id: "rendimiento", label: "Rendimiento", icon: "/assets/icons/metrics.svg" },
];

export function MentorTabs({ weakPoint = "Transición de mano izquierda" }: MentorTabsProps) {
  const [activeTab, setActiveTab] = useState<MentorTabId>("carga");

  // Escucha peticiones de cambio de pestaña desde cualquier componente.
  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ tab: MentorTabId }>;
      setActiveTab(custom.detail.tab);
    };
    mentorTabEvents.addEventListener("mentor:switch-tab", handler as EventListener);
    return () => mentorTabEvents.removeEventListener("mentor:switch-tab", handler as EventListener);
  }, []);

  const goTo = useCallback((tab: MentorTabId) => {
    switchMentorTab(tab);
  }, []);

  return (
    <section className={styles.tabs}>
      <nav className={styles.tablist} role="tablist" aria-label="Pestañas del mentor">
        {TABS.map((tab) => {
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
        {TABS.map((tab) => {
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
              {tab.id === "sesion" && <SessionStatus />}
              {tab.id === "rendimiento" && (
                <PerformanceStats weakPoint={weakPoint} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
