// description: Página /recuperar/[token] — formulario para restablecer la contraseña con un enlace de un solo uso.
// context: Recibe el token de la URL dinámica [token], muestra el formulario y llama a POST /api/v1/auth/reset-password.
// Al éxito, redirige al login con un mensaje.
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "../AuthShell";
import ResetPasswordForm from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  const router = useRouter();

  // Next.js 16 app router: token from dynamic segment [token]
  // Access via router.query or router.asPath - use type assertion for flexibility
  let token: string | undefined;
  // Try query first, fall back to parsing asPath
  if ((router as any).query?.token) {
    token = String((router as any).query.token);
  } else if ((router as any).asPath) {
    const parts = (router as any).asPath.split("/").filter(Boolean);
    token = parts.length > 2 ? parts[2] : null;
  }

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(true);
      router.replace("/recuperar");
    }
  }, [token, router]);

  if (loading || !token) {
    return (
      <AuthShell
        title="Recupera tu contraseña"
        hint="Enlace no válido. Pide un nuevo enlace a continuación."
      >
        <p>El enlace de restablecimiento no es válido o ha expirado.</p>
        <Link href="/recuperar">Volver a solicitar enlace</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Restablece tu contraseña"
      hint="Elige una nueva contraseña a continuación."
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}