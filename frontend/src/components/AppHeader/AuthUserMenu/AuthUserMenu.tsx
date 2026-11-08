// description: Menú de usuario de la cabecera: inicio con Google o con contraseña (U-005).
// context: Único componente cliente de AppHeader. Consulta la sesión de
// Auth.js (/api/auth/session) en una única lectura al montar; el botón
// "Iniciar sesión" abre el mini box (AuthSignInModal) y el registro en el
// backend ocurre en los callbacks de lib/auth.ts, aquí nada va al backend.

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { signIn, signOut } from "next-auth/react";

import { toAuthUserInfo, type AuthSessionRaw, type AuthUserInfo } from "../../../lib/auth-user";
import { ApiError, registerAuthSession } from "../../../lib/api-client";
import { AuthSignInModal } from "./AuthSignInModal/AuthSignInModal";
import { UserAvatar } from "../UserAvatar/UserAvatar";
import styles from "./AuthUserMenu.module.css";
import type { AuthUserMenuProps, AuthUserMenuStatus } from "./AuthUserMenu.types";

/** AUTOLOGIN solo fuera de producción: el bundle cliente ya sabe su NODE_ENV. */
function autologinRequested() {
  return (
    process.env.NEXT_PUBLIC_AUTOLOGIN === "true" && process.env.NODE_ENV !== "production"
  );
}

export function AuthUserMenu({ fallbackInitial = "A" }: AuthUserMenuProps) {
  const [status, setStatus] = useState<AuthUserMenuStatus>("loading");
  const [user, setUser] = useState<AuthUserInfo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Escucha evento global para abrir el modal desde componentes hermanos (p.ej. RegisterWizard).
  useEffect(() => {
    function onOpenLogin() {
      setModalOpen(true);
    }
    window.addEventListener("piano-mentor:open-login", onOpenLogin);
    return () => window.removeEventListener("piano-mentor:open-login", onOpenLogin);
  }, []);

  // Una única consulta al montar. El sign-in y el sign-out recargan la
  // página entera (redirect de Google o del login con contraseña), con lo
  // que este efecto vuelve a ejecutarse: no hace falta escuchar la sesión.
  // Además se valida el token contra el backend: si caducó (id_token de
  // Google ~1 h, JWT propio 12 h) la sesión local de Auth.js ya no sirve y
  // se limpia para que la UI no mienta (icono de usuario sin piezas).
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const raw: AuthSessionRaw | null = response.ok ? await response.json() : null;
        if (!active) return;
        const { user: info, accessToken } = toAuthUserInfo(raw ?? null);
        if (!info) {
          setStatus("anonymous");
          return;
        }
        // Comprobación real contra el backend: el token puede haber caducado.
        if (accessToken) {
          try {
            await registerAuthSession(accessToken);
          } catch (err) {
            if (
              err instanceof ApiError &&
              (err.code === "auth_invalid_token" ||
                err.code === "auth_invalid_header" ||
                err.code === "auth_missing_header")
            ) {
              if (!active) return;
              await signOut({ redirect: false });
              if (active) {
                setUser(null);
                setStatus("anonymous");
              }
              window.location.reload();
              return;
            }
            // Otro error (backend caído, etc.): conservamos la sesión local.
          }
        }
        if (!active) return;
        setUser(info);
        setStatus("signed");
      } catch {
        if (active) setStatus("anonymous");
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // Otras partes de la app (p. ej. la Library) pueden detectar un token
  // caducado al llamar al backend y avisar aquí para limpiar la sesión.
  useEffect(() => {
    function onInvalid() {
      void signOut({ redirect: false }).then(() => window.location.reload());
    }
    window.addEventListener("piano-mentor:auth-invalid", onInvalid);
    return () => window.removeEventListener("piano-mentor:auth-invalid", onInvalid);
  }, []);

  // AUTOLOGIN=true (solo fuera de producción): entra directo en la cuenta
  // admin una vez, con las credenciales vacías que lleva el proveedor
  // Credentials del backend. Un solo disparo por render anónimo; si falla
  // (sin AUTOLOGIN en el back, backend caído) vuelve al estado anónimo.
  useEffect(() => {
    if (status !== "anonymous" || !autologinRequested()) return;
    setStatus("loading");
    void signIn("credentials", { autologin: "1" })
      .catch(() => setStatus("anonymous"));
  }, [status]);

  const handleSignOut = () => {
    void signOut().then(() => window.location.reload());
  };

  let content: ReactNode;
  if (status === "loading") {
    content = (
      <span className={styles.loading} data-testid="auth-loading">
        <UserAvatar initial={fallbackInitial} />
      </span>
    );
  } else if (status === "anonymous") {
    content = (
      <>
        <button type="button" className={styles.signIn} onClick={() => setModalOpen(true)}>
          Iniciar sesión
        </button>
        <AuthSignInModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  } else {
    const initial = (user?.name?.trim()?.[0] ?? fallbackInitial).toUpperCase();
    content = (
      <span className={styles.signed}>
        <UserAvatar initial={initial} color={user?.color} src={user?.picture} />
        <button type="button" className={styles.signOut} onClick={handleSignOut}>
          Salir
        </button>
      </span>
    );
  }

  return <span className={styles.menu}>{content}</span>;
}
