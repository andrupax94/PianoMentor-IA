// description: Navegación principal (Learn, Library, Progress, Settings).
// context: B-006.4; armazón estático, sin rutas todavía.

import styles from "./MainNav.module.css";
import type { MainNavProps } from "./MainNav.types";

const ITEMS = [
  { id: "learn", label: "Learn", icon: "Learn" },
  { id: "library", label: "Library", icon: "Library" },
  { id: "progress", label: "Progress", locked: true, icon: "Lock" },
  { id: "settings", label: "Settings", locked: true, icon: "Lock" },
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
          <p
            style={{
              color: !("locked" in item && item.locked)
                ? `white`
                : `gray`
            }}
          >{item.label}

          </p>
          <span
            style={{
              backgroundImage: !("locked" in item && item.locked)
                ? `url(/assets/icons/${item.icon}.svg)`
                : `url(/assets/icons/Lock.svg)`

            }}
          ></span>


        </span>
      ))}
    </nav>
  );
}
