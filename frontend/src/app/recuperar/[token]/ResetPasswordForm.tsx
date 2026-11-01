// description: Formulario de restablecimiento de contraseña (U-007).
// context: Recibe el token por props, valida fuerza de contraseña, llama a POST /api/v1/auth/reset-password.
// Estados: idle, sending, done, invalid.
// Al éxito cierra sesión anterior y redirige al login.
// Errores: 400 token inválido/caducado/usado, 422 contraseña débil.
"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { resetPassword } from "@/lib/api-client";
import styles from "../AuthShell.module.css";

type Status = "idle" | "sending" | "done" | "invalid";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; server?: string }>({});
  const [status, setStatus] = useState<Status>("idle");

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (status === "sending") return;

    const found: typeof errors = {};
    // Política de contraseña: misma que el registro (U-006)
    if (password.length < 8) found.password = "Usa al menos 8 caracteres.";
    if (confirm !== password) found.confirm = "Las contraseñas no coinciden.";
    setErrors(found);
    if (Object.keys(found).length) return;

    setStatus("sending");
    try {
      await resetPassword({ token, password });
      setStatus("done");
      // Redirigir al login después de un breve delay para mostrar el mensaje
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    } catch (err) {
      setStatus("idle");
      if (err instanceof Error) {
        const apiErr = err as { code?: string; message?: string };
        if (apiErr.code === "auth_invalid_token") {
          setErrors({ server: "Este enlace ya no es válido. Pide uno nuevo para continuar." });
          setStatus("invalid");
        } else if (apiErr.code === "auth_weak_password") {
          setErrors({ password: apiErr.message || "Usa al menos 8 caracteres." });
          setStatus("invalid");
        } else if (apiErr.code === "auth_rate_limited") {
          setErrors({ server: "Demasiados intentos. Espera unos minutos y vuelve a probar." });
          setStatus("invalid");
        } else {
          setErrors({ server: "Error del servidor. Inténtalo de nuevo más tarde." });
          setStatus("invalid");
        }
      } else {
        setErrors({ server: "Error de conexión. Revisa tu red e inténtalo de nuevo." });
        setStatus("invalid");
      }
    }
  }

  if (status === "done") {
    return (
      <div className={styles.message} role="status">
        <p>Tu contraseña se ha actualizado correctamente. Ahora puedes iniciar sesión.</p>
        <Link href="/" className={styles.ghost}>
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className={styles.message} role="alert">
        <p>{Object.values(errors)[0] || "Error desconocido"}</p>
        <Link href="/recuperar">Solicitar nuevo enlace</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className={styles.form}>
      <label className={styles.field}>
        <span>Nueva contraseña</span>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrors({} as any);
          }}
          autoComplete="new-password"
          aria-invalid={!!Object.keys(errors).length || !!errors.server}
        />
        {errors.password && <small className={styles.error}>{errors.password}</small>}
      </label>

      <label className={styles.field}>
        <span>Confirmar contraseña</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setErrors({} as any);
          }}
          autoComplete="new-password"
        />
        {errors.confirm && <small className={styles.error}>{errors.confirm}</small>}
      </label>

      <div className={styles.actions}>
        <Link href="/recuperar" className={styles.ghost}>
          Solicitar nuevo enlace
        </Link>
        <button type="submit" className={styles.primary} disabled={status === "sending"}>
          {status === "sending" ? "Enviando…" : "Restablecer contraseña"}
        </button>
      </div>
    </form>
  );
}