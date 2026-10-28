"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import styles from "./recovery.module.css";

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
    // TODO: misma política que el registro (U-006).
    if (password.length < 8) found.password = "Usa al menos 8 caracteres.";
    if (confirm !== password) found.confirm = "Las contraseñas no coinciden.";
    setErrors(found);
    if (Object.keys(found).length) return;

    setStatus("sending");
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) return setStatus("done");

      // TODO(opencode): ajustar a los códigos reales. Token usado, caducado o inventado → mismo mensaje.
      if (res.status === 400 || res.status === 404 || res.status === 410) return setStatus("invalid");
      if (res.status === 429) setErrors({ server: "Demasiados intentos. Espera unos minutos." });
      else if (res.status === 422) setErrors({ password: "La contraseña no cumple la política de seguridad." });
      else setErrors({ server: "No hemos podido cambiar la contraseña. Inténtalo de nuevo." });
      setStatus("idle");
    } catch {
      setErrors({ server: "Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo." });
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className={styles.message} role="status">
        <p>Contraseña actualizada. Por seguridad, hemos cerrado tus otras sesiones: inicia sesión con la nueva.</p>
        <Link href="/login" className={styles.primary}>
          Iniciar sesión
        </Link>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className={styles.message} role="alert">
        <p>Este enlace ya no es válido. Pide uno nuevo para continuar.</p>
        <Link href="/recuperar" className={styles.primary}>
          Pedir otro enlace
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className={styles.form}>
      <label className={styles.field}>
        <span>Contraseña nueva</span>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrors((p) => ({ ...p, password: undefined, server: undefined }));
          }}
          autoComplete="new-password"
        />
        {errors.password && <small className={styles.error}>{errors.password}</small>}
      </label>

      <label className={styles.field}>
        <span>Repite la contraseña</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setErrors((p) => ({ ...p, confirm: undefined }));
          }}
          autoComplete="new-password"
        />
        {errors.confirm && <small className={styles.error}>{errors.confirm}</small>}
      </label>

      {errors.server && <p className={styles.error}>{errors.server}</p>}

      <div className={styles.actions}>
        <span />
        <button type="submit" className={styles.primary} disabled={status === "sending"}>
          {status === "sending" ? "Guardando…" : "Guardar contraseña"}
        </button>
      </div>
    </form>
  );
}
