// description: Props del mini box de acceso (U-005).
// context: Tipos únicamente; la lógica vive en AuthSignInModal.tsx.

export interface AuthSignInModalProps {
  /** Abierto/cerrado lo controla AuthUserMenu al pulsar «Iniciar sesión». */
  open: boolean;
  onClose: () => void;
}
