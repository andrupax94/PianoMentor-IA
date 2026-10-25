// description: Props del avatar de usuario.
// context: B-006.4 (armazón) y U-005 (color aleatorio de la burbuja).

export interface UserAvatarProps {
  /** Inicial mostrada en el avatar. */
  initial?: string;
  /** Color de la burbuja (#rrggbb); hace falta el amarillo del armazón. */
  color?: string | null;
}
