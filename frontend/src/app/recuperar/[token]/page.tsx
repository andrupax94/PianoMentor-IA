// description: Página /recuperar/[token] — formulario para restablecer la contraseña.
// context: Recibe el token de la URL dinámica [token] y muestra el formulario de reset.
// Al éxito, redirige al login con un mensaje.
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import AuthShell from "../AuthShell";
import ResetPasswordForm from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  const router = useRouter();
  const pathname = usePathname();

  // Extraer token de la pathname: /recuperar/abc123
  // pathname example: "/recuperar/7l1t1ICf1BKJiDfDnluKYBevI6K5yErafr91p7zUCnE"
  const parts = pathname.split("/").filter(Boolean);
  // parts[0] = "recuperar", parts[1] = token
  const token = parts.length >= 2 ? parts[1] : null;

  const [loading, setLoading] = useState(false);

  // Si no hay token en la URL, mostrar error
  if (!token) {
    return (
      <AuthShell
        title="Recupera tu contraseña"
        hint="Enlace no válido. Pide un nuevo enlace a continuación."
      >
        <p>El enlace de restablecimiento no es válido o ha expirado.</p>
        <Link href="/recuperar">Solicitar nuevo enlace</Link>
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