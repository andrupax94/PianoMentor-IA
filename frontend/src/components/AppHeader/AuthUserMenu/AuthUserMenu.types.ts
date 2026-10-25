// description: Props y estados del menú de usuario de la cabecera (U-005).
// context: Tipos únicamente; la lógica vive en AuthUserMenu.tsx y lib/auth-user.ts.

/** Estado interno del menú según lo que responde /api/auth/session. */
export type AuthUserMenuStatus = "loading" | "anonymous" | "signed";

export interface AuthUserMenuProps {
  /** Inicial del armazón estático (B-006.4) mientras la sesión no está clara. */
  fallbackInitial?: string;
}
