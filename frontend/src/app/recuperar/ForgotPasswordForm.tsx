// description: Formulario "¿Olvidaste tu contraseña?" (U-007).
// context: Pide el correo y llama a POST /api/v1/auth/forgot-password.
// Respuesta siempre neutra; estado "sent" muestra mensaje y botón volver al login.
"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { requestPasswordReset } from "@/lib/api-client";
import styles from "./AuthShell.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (status === "sending") return;
    if (!EMAIL_RE.test(email)) return setError("Escribe un correo válido.");

    setStatus("sending");
    setError("");
    try {
      await requestPasswordReset({ email });
      setStatus("sent");
    } catch (err) {
      setStatus("idle");
      if (err instanceof Error && "code" in err) {
        const apiErr = err as { code?: string; message?: string };
        if (apiErr.code === "auth_rate_limited") {
          return setError("Demasiados intentos. Espera unos minutos y vuelve a probar.");
        }
        if (apiErr.code === "auth_invalid_email") {
          return setError("Escribe un correo válido.");
        }
      }
      setError("Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.");
    }
  }

  if (status === "sent") {
    return (
      <div className={styles.message} role="status">
        <p>
          Si <b>{email}</b> está registrado, te hemos enviado un enlace para cambiar la contraseña.
          Caduca en 30 minutos.
        </p>
        <Link href="/" className={styles.ghost}>
          Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className={styles.form}>
      <label className={styles.field}>
        <span>Correo</span>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError("");
          }}
          autoComplete="email"
          aria-invalid={!!error}
        />
        {error && <small className={styles.error}>{error}</small>}
      </label>

      <div className={styles.actions}>
        <Link href="/" className={styles.ghost}>
          Volver
        </Link>
        <button type="submit" className={styles.primary} disabled={status === "sending"}>
          {status === "sending" ? "Enviando…" : "Enviar enlace"}
        </button>
      </div>
    </form>
  );
}