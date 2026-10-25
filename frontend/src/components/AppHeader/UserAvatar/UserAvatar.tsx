// description: Avatar de usuario (inicial).
// context: B-006.4; desde U-005 acepta el color aleatorio de la burbuja.

import styles from "./UserAvatar.module.css";
import type { UserAvatarProps } from "./UserAvatar.types";

export function UserAvatar({ initial = "A", color }: UserAvatarProps) {
  return (
    <span
      className={styles.avatar}
      style={color ? { background: color } : undefined}
      aria-label={`Usuario ${initial}`}
    >
      {initial}
    </span>
  );
}
