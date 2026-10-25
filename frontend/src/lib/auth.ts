// description: Configuración de Auth.js v5: Google y login simple con contraseña (U-005).
// context: El front gestiona el OAuth (Client ID + Secret) y el login con
// contraseña delega en POST /api/v1/auth/login del backend. La sesión es JWT
// firmada con AUTH_SECRET; el id_token de Google (vía Google) o el JWT propio
// del backend (vía contraseña) viajan en session.accessToken para el header
// Authorization. El color del avatar se fija en el primer login y no cambia.

import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { loginWithPassword, registerAuthSession } from "./api-client";

/**
 * Sesión con el token de identidad accesible desde el cliente (U-005):
 * id_token de Google o JWT del login con contraseña. `color` es el de la
 * burbuja del usuario (lo asigna el backend al crear la cuenta).
 * `JWT` también se amplia aquí: en v5 vive bajo el módulo raíz de next-auth.
 */
declare module "next-auth" {
  interface Session {
    accessToken?: string;
  }

  interface User {
    /** JWT propio del backend tras el login con contraseña (no sale de la sesión). */
    pmToken?: string;
    /** Color de la burbuja del usuario, para el avatar de la cabecera. */
    color?: string | null;
    /** Alias del color que viaja del authorize al callback jwt. */
    bubbleColor?: string | null;
  }

  interface JWT {
    /** id_token original de Google durante la vida de la sesión. */
    idToken?: string;
    /** JWT propio del backend tras el login con contraseña. */
    pmToken?: string;
    /** Color de la burbuja del usuario (no cambia tras el alta). */
    color?: string | null;
  }
}

const providers: Provider[] = [
  // Los nombres GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET son los que ya
  // documenta el proyecto (.env.example y la issue U-005); Auth.js daría
  // preferencia a AUTH_GOOGLE_ID, pero se sobreescribe pasándolos explícitos.
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }),
  // El login simple entra por el backend (verificación de contraseña y
  // color); authorize llama a POST /api/v1/auth/login con las credenciales
  // del box. La bandera NEXT_PUBLIC_AUTOLOGIN no cambia el proveedor: solo
  // activa el autoinicio del cliente.
  Credentials({
    credentials: {
      email: { label: "Usuario o correo" },
      password: { label: "Contraseña", type: "password" },
      autologin: { label: "Autologin" },
    },
    async authorize(credentials) {
      const email = typeof credentials?.email === "string" ? credentials.email : "";
      const password = typeof credentials?.password === "string" ? credentials.password : "";
      const autologin = credentials?.autologin === "1";
      try {
        const data = await loginWithPassword(email, password, autologin);
        return {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          image: data.user.picture,
          pmToken: data.access_token,
          bubbleColor: data.user.bubble_color,
        };
      } catch {
        // Credenciales erróneas, correo desconocido o cuenta de Google
        // sin contraseña: null provoca el error CredentialsSignin que
        // Auth.js traduce al mensaje del box.
        return null;
      }
    },
  }),
]

export const { auth, handlers, signIn, signOut } = NextAuth({
  // Detrás de Vercel y del proxy local el host real difiere del visible.
  trustHost: true,
  providers,
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user, account }) {
      // Vía Google: en el primer reparto de claims llega el id_token y se
      // registra al usuario en el backend una sola vez por login (el upsert
      // es idempotente); de ahí sale el color de la burbuja.
      if (account?.provider === "google" && account.id_token) {
        token.idToken = account.id_token;
        const registered = await registerAuthSession(account.id_token).catch(() => null);
        if (registered) {
          token.sub = registered.id;
          token.color = registered.bubble_color ?? null;
        }
      }
      // Vía contraseña: authorize ya validó y el backend devolvió el token.
      if (user && account?.provider === "credentials") {
        token.pmToken = typeof user.pmToken === "string" ? user.pmToken : undefined;
        token.color = user.bubbleColor ?? null;
        if (user.id) token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.idToken === "string") {
        session.accessToken = token.idToken;
      } else if (typeof token.pmToken === "string") {
        session.accessToken = token.pmToken;
      }
      session.user.color = typeof token.color === "string" ? token.color : null;
      return session;
    },
  },
});
