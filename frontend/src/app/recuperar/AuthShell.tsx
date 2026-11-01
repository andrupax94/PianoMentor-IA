// description: Marco común (panel con piano + panel de contenido) para auth.
// context: Compartido por /registro, /recuperar y /recuperar/[token].
// Reutiliza la foto de piano del wizard de registro.
"use client";

import Image from "next/image";
import Link from "next/link";
import styles from "./AuthShell.module.css";

export interface AuthShellProps {
  title: string;
  hint: string;
  children: React.ReactNode;
}

export default function AuthShell({ title, hint, children }: AuthShellProps) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {/* Panel izquierdo: piano de fondo */}
        <aside className={styles.aside}>
          <div className={styles.asideContent}>
            <Link href="/" className={styles.brand}>
              <Image src="/assets/icons/Logo.svg" alt="" width={28} height={28} />
              <span>
                PianoMentor <b>AI</b>
              </span>
            </Link>

            <div className={styles.asideIntro}>
              <h2>Tu cuenta</h2>
              <p>{hint}</p>
            </div>
          </div>
        </aside>

        {/* Panel derecho: formulario */}
        <section className={styles.panel}>
          <h1 className={styles.title}>{title}</h1>
          {children}
        </section>
      </div>
    </main>
  );
}