// description: Encabezado principal: logo, navegación, estado MIDI y avatar.
// context: B-006.4; armazón estático, sin lógica todavía.

import { BrandLogo } from "./BrandLogo/BrandLogo";
import { MainNav } from "./MainNav/MainNav";
import { MidiStatus } from "./MidiStatus/MidiStatus";
import { AuthUserMenu } from "./AuthUserMenu/AuthUserMenu";
import styles from "./AppHeader.module.css";
import type { AppHeaderProps } from "./AppHeader.types";

export function AppHeader({ userInitial = "A", active = "learn" }: AppHeaderProps) {
  return (
    <header className={`${styles.bar} cristal-azul-max`}>
      <BrandLogo />
      <MainNav active={active} />
      <MidiStatus />
      {/* U-005: entrada/salida con Google y registro en el backend. */}
      <AuthUserMenu fallbackInitial={userInitial} />
    </header>
  );
}
