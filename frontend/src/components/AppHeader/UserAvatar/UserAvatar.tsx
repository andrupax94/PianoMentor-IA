// description: Avatar de usuario (inicial).
// context: B-006.4; armazón estático.

import styles from "./UserAvatar.module.css";
import type { UserAvatarProps } from "./UserAvatar.types";

export function UserAvatar({ initial = "A" }: UserAvatarProps) {
  return (
    <span className={styles.avatar} aria-label={`Usuario ${initial}`}>
      {initial}
    </span>
  );
}
