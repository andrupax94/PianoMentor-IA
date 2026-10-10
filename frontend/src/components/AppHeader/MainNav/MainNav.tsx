// description: Navegación principal (Learn, Library, Progress, Settings).
// context: B-006.4; armazón estático, sin rutas todavía.

import styles from "./MainNav.module.css";
import type { MainNavProps } from "./MainNav.types";

const ITEMS = [
  { id: "learn", label: "Learn" },
  { id: "library", label: "Library" },
  { id: "progress", label: "Progress", locked: true },
  { id: "settings", label: "Settings", locked: true },
] as const;

export function MainNav({ active = "learn" }: MainNavProps) {
  return (
    <nav className={styles.nav} aria-label="Principal">
      {ITEMS.map((item) => (
        <span
          key={item.id}
          className={item.id === active ? styles.active : undefined}
          aria-current={item.id === active ? "page" : undefined}
        >
          {item.label}
          {"locked" in item && item.locked ? " 🔒" : ""}
        </span>
      ))}
    </nav>
  );
}
