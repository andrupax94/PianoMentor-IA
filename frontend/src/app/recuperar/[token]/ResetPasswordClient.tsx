"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import AuthShell from "../AuthShell";
import ResetPasswordForm from "./ResetPasswordForm";

export default function ResetPasswordClient() {
  const router = useRouter();
  const pathname = usePathname();

  const parts = pathname.split("/").filter(Boolean);
  const token = parts.length >= 2 ? parts[1] : null;

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