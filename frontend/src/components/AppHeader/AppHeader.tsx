// description: Encabezado principal: compone logo, navegación, estado MIDI y avatar. B-035: ya no recibe `midiConnected` por props — MidiStatus lee su estado por sí mismo del almacén midi-store.
// context: B-006.4; armazón estático. B-035: la detección Web MIDI real vive en TransportProvider/midi-store.

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
