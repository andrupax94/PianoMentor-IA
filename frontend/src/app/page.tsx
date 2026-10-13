// description: Página inicial: armazón AppHeader + columna de reproducción + MentorPanel.
// context: B-007.3; sigue siendo Server Component: el transporte vive en PlaybackArea,
// así que AppHeader y MentorPanel no se arrastran al bundle de cliente (guía de Next).

import { AppHeader } from "../components/AppHeader/AppHeader";
import { MentorPanel } from "../components/MentorPanel/MentorPanel";
import { PlaybackArea } from "../components/PlaybackArea/PlaybackArea";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <div className="shell">
      <AppHeader />
      <div className={styles.layout}>
        <PlaybackArea />
        <MentorPanel />
      </div>
    </div>
  );
}
