// description: Encabezado principal: logo, navegación, estado MIDI y avatar.
// context: B-006.4; armazón estático, sin lógica todavía.

import { BrandLogo } from "./BrandLogo/BrandLogo";
import { MainNav } from "./MainNav/MainNav";
import { MidiStatus } from "./MidiStatus/MidiStatus";
import { UserAvatar } from "./UserAvatar/UserAvatar";
import styles from "./AppHeader.module.css";
import type { AppHeaderProps } from "./AppHeader.types";

export function AppHeader({ midiConnected = true, userInitial = "A" }: AppHeaderProps) {
  return (
    <header className={styles.bar}>
      <BrandLogo />
      <MainNav />
      <MidiStatus connected={midiConnected} />
      <UserAvatar initial={userInitial} />
    </header>
  );
}
