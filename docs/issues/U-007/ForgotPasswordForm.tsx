"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import styles from "./recovery.module.css";

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
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        setStatus("idle");
        return setError("Demasiados intentos. Espera unos minutos y vuelve a probar.");
      }
      // Cualquier otra respuesta del backend se trata igual: mensaje neutro (no revelar si la cuenta existe).
      setStatus("sent");
    } catch {
      setStatus("idle");
      setError("Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.");
    }
  }

  if (status === "sent") {
    return (
      <div className={styles.message} role="status">
        <p>
          Si <b>{email}</b> está registrado, te hemos enviado un enlace para cambiar la contraseña. Caduca en 30 minutos.
        </p>
        <Link href="/login" className={styles.ghost}>
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
        <Link href="/login" className={styles.ghost}>
          Volver
        </Link>
        <button type="submit" className={styles.primary} disabled={status === "sending"}>
          {status === "sending" ? "Enviando…" : "Enviar enlace"}
        </button>
      </div>
    </form>
  );
}
