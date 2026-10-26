// description: Mini box de acceso: cuenta o correo con contraseña y acceso con Google (U-005).
// context: Se abre desde "Iniciar sesión" de la cabecera y oscurece el fondo
// levemente. El login simple va al backend por Auth.js (Credentials en
// lib/auth.ts); el botón de Google reutiliza el flujo de U-005. El registro
// simple queda de lado: solo hay entrar con credenciales ya existentes.

"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";

import styles from "./AuthSignInModal.module.css";
import type { AuthSignInModalProps } from "./AuthSignInModal.types";

/** El mensaje típico, sin revelar si falló el usuario o la contraseña. */
export const INVALID_CREDENTIALS_MESSAGE = "No existe esta combinación de usuario y contraseña.";

export function AuthSignInModal({ open, onClose }: AuthSignInModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  // Al abrir: caja limpia y foco en la cuenta; el foco vuelve si falla el
  // intento de entrar (recarga de la página solo con credenciales buenas).
  useEffect(() => {
    if (open) {
      setEmail("");
      setPassword("");
      setBusy(false);
      setError(null);
      emailRef.current?.focus();
    }
  }, [open]);

  // Escap cierra el box; el clic fuera también (manejada por el overlay).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleEnter = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    // redirect: false deja la respuesta en esta página; fallar muestra el
    // mensaje del box y acertar recarga para que la cabecera pinte al usuario.
    const result = await signIn("credentials", { email, password, redirect: false }).catch(
      (reason: unknown) => reason,
    );
    if (result && (result instanceof Error || (result as { error?: string }).error)) {
      setError(INVALID_CREDENTIALS_MESSAGE);
      setBusy(false);
      return;
    }
    window.location.reload();
  };

  return (
    <div className={styles.overlay} onMouseDown={handleOverlayDown} role="presentation">
      <div className={styles.box} role="dialog"
        aria-modal="true"
        aria-label="Iniciar sesión">
        <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
          ×
        </button>
        <span className={styles.logo} aria-hidden="true" />
        <h2 className={styles.title}>Iniciar sesión</h2>
        <form className={styles.form} onSubmit={handleEnter}>
          <input
            ref={emailRef}
            type="text"
            name="email"
            className={styles.input}
            placeholder="Usuario o correo"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
          <input
            type="password"
            name="password"
            className={styles.input}
            placeholder="Contraseña"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
          {error && (
            <p className={styles.error} role="alert" data-testid="auth-error">
              {error}
            </p>
          )}
          <button type="submit" className={styles.enter} disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <div className={styles.divider}>
          <span className={styles.dividerText}>o</span>
        </div>
        <button type="button" className={styles.google} onClick={handleGoogle} disabled={busy}>
          Continuar con Google
        </button>
      </div>
    </div>
  );

  function handleOverlayDown(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  function handleGoogle() {
    // Igual que antes: redirect completo al consentimiento y vuelta.
    void signIn("google");
  }
}
