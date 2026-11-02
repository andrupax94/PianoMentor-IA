// description: Avatar de usuario (inicial o foto de perfil).
// context: B-006.4; desde U-005 acepta el color aleatorio de la burbuja. U-008.1 muestra la foto de perfil si existe.

import styles from "./UserAvatar.module.css";
import type { UserAvatarProps } from "./UserAvatar.types";

export function UserAvatar({ initial = "A", color, src }: UserAvatarProps) {
  return (
    <span
      className={styles.avatar}
      style={
        src
          ? { backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center" }
          : color
            ? { background: color }
            : undefined
      }
      aria-label={`Usuario ${initial}`}
    >
      {src ? null : initial}
    </span>
  );
}