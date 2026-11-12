"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./AppFooter.module.css";

const APP_NAME = "PianoMentor AI";
const GITHUB_URL = "https://github.com/andrupax94";

const SHOW_LEGAL =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_SHOW_LEGAL === "true" ||
  process.env.NEXT_PUBLIC_LEGAL_ENABLED === "true" ||
  process.env.NEXT_PUBLIC_ENABLE_LEGAL === "true";

export default function AppFooter() {
  const [expanded, setExpanded] = useState(false);
  const footerRef = useRef<HTMLElement | null>(null);
  const contactNameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onOpenContact() {
      setExpanded(true);
      window.setTimeout(() => contactNameRef.current?.focus(), 320);
    }
    function onClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-contact-trigger]")) return;
      if (footerRef.current && !footerRef.current.contains(target)) {
        setExpanded(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }
    window.addEventListener("piano-mentor:open-contact", onOpenContact);
    document.addEventListener("click", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("piano-mentor:open-contact", onOpenContact);
      document.removeEventListener("click", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  function handleFooterClick() {
    if (!expanded) setExpanded(true);
  }

  function handleContactSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExpanded(false);
  }

  return (
    <footer
      ref={footerRef}
      className={styles.footer}
      onClick={handleFooterClick}
      style={{
        maxHeight: expanded ? "760px" : "72px",
        transition: "max-height 320ms ease",
        overflow: "hidden",
        cursor: expanded ? "default" : "pointer",
        zIndex: expanded ? 60 : "auto",
        boxShadow: expanded ? "0 -8px 32px rgba(0,0,0,0.5)" : "none",
        position: expanded ? "fixed" : "static",
        bottom: expanded ? 0 : "auto",
        left: expanded ? 0 : "auto",
        right: expanded ? 0 : "auto",
        width: "100%",
      }}
      aria-expanded={expanded}
    >
      <div className={styles.container}>
        <div className={styles.brand}>
          <Image
            src="/assets/icons/Logo.svg"
            alt={`Logo de ${APP_NAME}`}
            width={20}
            height={20}
            className={styles.logo}
          />
          <p className={styles.copy}>
            © {new Date().getFullYear()} {APP_NAME}. Todos los derechos reservados.
          </p>
        </div>

        <div className={styles.miniLinks} style={{ opacity: expanded ? 0 : 1, transition: "opacity 200ms ease" }}>
          {SHOW_LEGAL && (
            <>
              <Link href="/legal/terminos">Términos</Link>
              <Link href="/legal/privacidad">Privacidad</Link>
            </>
          )}
          <button
            type="button"
            className={styles.contactTrigger}
            data-contact-trigger="true"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(true);
              window.setTimeout(() => contactNameRef.current?.focus(), 320);
            }}
          >
            Contacto
          </button>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.github}
            aria-label="GitHub de andrupax94 (Andres Eduardo Palencia Rojas)"
            onClick={(event) => event.stopPropagation()}
          >
            GitHub
          </a>
        </div>
      </div>

      <div
        className={styles.expanded}
        style={{ opacity: expanded ? 1 : 0, transition: "opacity 240ms ease 80ms" }}
        aria-hidden={!expanded}
      >
        <div className="w-full px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <section className={styles.brandCol}>
              <div className={styles.brandMark}>
                <span className={styles.brandIcon}>🎹</span>
                <div>
                  <strong>{APP_NAME}</strong>
                  <small>Práctica de piano con IA</small>
                </div>
              </div>
              <p className={styles.tagline}>
                Mentor pedagógico adaptativo y telemetría acústica.
              </p>
            </section>

            <section className={styles.contactCol}>
              <h2>Contacto</h2>
              <form className={styles.contactForm} onSubmit={handleContactSubmit}>
                <label>
                  Nombre
                  <input ref={contactNameRef} type="text" name="name" placeholder="Tu nombre" required />
                </label>
                <label>
                  Correo
                  <input type="email" name="email" placeholder="tu@correo.com" required />
                </label>
                <label>
                  Mensaje
                  <textarea name="message" rows={3} placeholder="¿En qué podemos ayudarte?" required />
                </label>
                <button type="submit" className={styles.submit}>
                  Enviar mensaje
                </button>
              </form>
            </section>

            <section className={styles.linksCol}>
              <h2>Enlaces</h2>
              <ul>
                {SHOW_LEGAL && (
                  <>
                    <li>
                      <Link href="/legal/terminos">Términos y condiciones</Link>
                    </li>
                    <li>
                      <Link href="/legal/privacidad">Política de privacidad</Link>
                    </li>
                  </>
                )}
                <li>
                  <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                    GitHub
                  </a>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </footer>
  );
}
