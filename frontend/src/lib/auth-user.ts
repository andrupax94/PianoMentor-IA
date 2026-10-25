// description: Puente de identidad entre Auth.js y la UI (U-005).
// context: Normaliza la sesión de Auth.js (GET /api/auth/session) a un payload
// pequeño para la cabecera. El registro en el backend ocurre una sola vez por
// login, en los callbacks jwt de lib/auth.ts (vía Google) o en authorize
// (vía contraseña), así que aquí no hay llamadas al backend.

/** Datos de usuario que muestra la cabecera; vacío cuando no hay sesión. */
export interface AuthUserInfo {
  id: string;
  name: string | null;
  email: string | null;
  picture: string | null;
  /** Color de la burbuja del usuario; null mientras el backend no lo asigne. */
  color: string | null;
}

/** Lo que devuelve GET /api/auth/session con la sesión jwt de Auth.js. */
export interface AuthSessionRaw {
  user?: {
    /** `google_sub` de Google (o `manual:<email>`): Auth.js lo copia desde token.sub. */
    id?: string | null;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    /** Color de la burbuja, expuesto por el callback `session` de Auth.js. */
    color?: string | null;
  } | null;
  /** Token de identidad (id_token de Google o JWT del login) para el Bearer. */
  accessToken?: string | null;
}

/**
 * Estrecha la sesión cruda de Auth.js a lo que muestra la UI.
 * Sin token (login fallido o deprecado) no hay identidad que enseñar.
 */
export function toAuthUserInfo(session: AuthSessionRaw | null): {
  user: AuthUserInfo | null;
  accessToken: string | null;
} {
  if (!session?.accessToken || !session.user) {
    return { user: null, accessToken: null };
  }
  return {
    user: {
      id: session.user.id ?? session.user.email ?? "",
      name: session.user.name ?? null,
      email: session.user.email ?? null,
      picture: session.user.image ?? null,
      color: session.user.color ?? null,
    },
    accessToken: session.accessToken,
  };
}
