// description: Props del avatar de usuario.
// context: B-006.4 (armazón) y U-005 (color aleatorio de la burbuja). U-008.1 añade foto de perfil.

export interface UserAvatarProps {
  /** Inicial mostrada en el avatar. */
  initial?: string;
  /** Color de la burbuja (#rrggbb); hace falta el amarillo del armazón. */
  color?: string | null;
  /** URL de la foto de perfil; si existe, se muestra en lugar de la inicial. */
  src?: string | null;
}