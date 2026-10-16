// description: Navegación principal (Learn, Library, Progress, Settings).
// context: B-006.4; Learn y Library llevan a su página con <Link>; Progress y
// Settings siguen sin ruta y no navegan.

import Link from "next/link";

import styles from "./MainNav.module.css";
import type { MainNavProps } from "./MainNav.types";

/* `href: null` marca las secciones que aún no tienen pantalla. */
const ITEMS = [
  { id: "learn", label: "Learn", icon: "Learn", href: "/" },
  { id: "library", label: "Library", icon: "Library", href: "/library" },
  { id: "progress", label: "Progress", icon: "Lock", href: null },
  { id: "settings", label: "Settings", icon: "Lock", href: null },
] as const;

export function MainNav({ active = "learn" }: MainNavProps) {
  return (
    <nav className={styles.nav} aria-label="Principal">
      {ITEMS.map(({ id, label, icon, href }) => {
        const className = id === active ? styles.active : undefined;
        const pending = href === null;
        const content = (
          <>
            <p style={{ color: pending ? `gray` : `white` }}>{label}</p>
            <span style={{ backgroundImage: `url(/assets/icons/${icon}.svg)` }}></span>
          </>
        );

        if (href === null) {
          return (
            <span key={id} className={className} aria-disabled="true">
              {content}
            </span>
          );
        }

        return (
          <Link
            key={id}
            href={href}
            className={className}
            aria-current={id === active ? "page" : undefined}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
