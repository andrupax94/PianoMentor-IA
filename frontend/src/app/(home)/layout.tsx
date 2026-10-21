// description: Layout de la portada, con y sin sesión de práctica activa.
// context: La práctica es la propia portada: al compartir layout entre / y /{id}, la navegación no remonta el piano ni el panel del mentor y el chat se queda donde estaba. La sesión la monta la página [sessionId] con PracticeBridge.

import type { ReactNode } from "react";

import AppFooter from "../../components/AppFooter/AppFooter";
import { AppHeader } from "../../components/AppHeader/AppHeader";
import { MentorPanel } from "../../components/MentorPanel/MentorPanel";
import { PlaybackArea } from "../../components/PlaybackArea/PlaybackArea";
import styles from "./layout.module.css";

export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <AppHeader />
      <div className={styles.layout}>
        <PlaybackArea />
        <MentorPanel />
      </div>
      {children}
      <AppFooter />
    </div>
  );
}
