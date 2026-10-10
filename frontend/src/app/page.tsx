// description: Página inicial: armazón AppHeader + PlayerBar + PianoStage + MentorPanel.
// context: B-006.4; los componentes existentes viven dentro del armazón sin modificarse.

import { AppHeader } from "../components/AppHeader/AppHeader";
import { MentorPanel } from "../components/MentorPanel/MentorPanel";
import { PianoStage } from "../components/PianoStage/PianoStage";
import { PlayerBar } from "../components/PlayerBar/PlayerBar";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <div className="shell">
      <AppHeader />
      <div className={styles.layout}>
        <div className={styles.main}>
          <PlayerBar />
          <PianoStage />
        </div>
        <MentorPanel />
      </div>
    </div>
  );
}
