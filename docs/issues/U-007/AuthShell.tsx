import Image from "next/image";
import Link from "next/link";
import styles from "./recovery.module.css";

/** Marco común (panel con piano + panel de contenido). Candidato a compartirse con el wizard de registro. */
export default function AuthShell({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
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

        <section className={styles.panel}>
          <h1 className={styles.title}>{title}</h1>
          {children}
        </section>
      </div>
    </main>
  );
}
