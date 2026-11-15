// description: Modal de feedback: formulario de comentarios (nombre, correo, tipo, calificación y mensaje) con envío simulado y mensaje de confirmación. Se abre desde el enlace "Feedback" del footer minimizado.
// context: Referencia de diseño visual: proyecto Stitch (pantalla principal de práctica), adaptado a la identidad real de PianoMentor AI (oscuro, navy+oro, Gabriola+Manrope, tokens de globals.css). Sigue el patrón de AuthSignInModal (createPortal, overlay, caja con borde degradado azul→oro, Escape y clic fuera para cerrar). Solo se monta en el cliente para evitar "document is not defined" en SSR.

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./Feedback.module.css";
import type { FeedbackProps } from "./Feedback.types";

const FEEDBACK_ICON = "💬";

const TYPE_OPTIONS = [
  { value: "sugerencia", label: "Sugerencia" },
  { value: "reporte", label: "Reporte de error" },
  { value: "elogio", label: "Elogio / agradecimiento" },
  { value: "otro", label: "Otro" },
];

export function Feedback({ open, onClose }: FeedbackProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState(TYPE_OPTIONS[0].value);
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  // Solo montar el portal en el cliente (evita "document is not defined" en SSR).
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const handleOverlayDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    // Simula el envío al backend (pendiente de endpoint real). En producción
    // esto debería llamar a una ruta de API de feedback.
    await new Promise((resolve) => setTimeout(resolve, 900));
    setSent(true);
    setBusy(false);
  };

  const handleReset = () => {
    setName("");
    setEmail("");
    setType(TYPE_OPTIONS[0].value);
    setRating(0);
    setMessage("");
    setSent(false);
    nameRef.current?.focus();
  };

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={handleOverlayDown}
      role="presentation"
    >
      <div
        className={styles.box}
        role="dialog"
        aria-modal="true"
        aria-label="Enviar feedback"
      >
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Cerrar feedback"
        >
          ×
        </button>

        {sent ? (
          <>
            <div className={styles.header}>
              <div className={styles.icon}>✅</div>
              <div>
                <h2 className={styles.title}>Mensaje enviado</h2>
                <p className={styles.subtitle}>
                  Gracias por tu feedback. Lo revisaremos y te responderemos a{" "}
                  {email || "tu correo"}.
                </p>
              </div>
            </div>
            <button
              type="button"
              className={styles.submit}
              onClick={handleReset}
            >
              Enviar otro mensaje
            </button>
          </>
        ) : (
          <>
            <div className={styles.header}>
              <div className={styles.icon}>{FEEDBACK_ICON}</div>
              <div>
                <h2 className={styles.title}>Envíanos tu feedback</h2>
                <p className={styles.subtitle}>
                  Tu opinión nos ayuda a mejorar PianoMentor AI. Cuéntanos qué
                  te gusta, qué falla o qué te gustaría ver.
                </p>
              </div>
            </div>

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label className={styles.label}>Nombre</label>
                <input
                  ref={nameRef}
                  type="text"
                  className={styles.input}
                  placeholder="Tu nombre"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  disabled={busy}
                  autoFocus
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Correo electrónico</label>
                <input
                  type="email"
                  className={styles.input}
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={busy}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Tipo de feedback</label>
                <select
                  className={styles.select}
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                  disabled={busy}
                >
                  {TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Calificación</label>
                <div className={styles.rating}>
                  <div className={styles.ratingLabels}>
                    <span>Pésimo</span>
                    <span>Excelente</span>
                  </div>
                  <div className={styles.stars}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        type="button"
                        key={n}
                        className={[
                          styles.star,
                          n <= rating ? styles.starFilled : "",
                        ]
                          .filter(Boolean)
                          .join(" ")
                          .trim()}
                        aria-label={`Calificar con ${n} estrella${n !== 1 ? "s" : ""}`}
                        aria-pressed={n <= rating}
                        onClick={() => setRating(n)}
                        disabled={busy}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Mensaje</label>
                <textarea
                  className={styles.textarea}
                  name="message"
                  placeholder="Cuéntanos tu experiencia con PianoMentor AI…"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                  required
                  disabled={busy}
                />
              </div>

              <p className={styles.hint}>
                Los datos se usan solo para responder tu mensaje. No se comparten
                con terceros.
              </p>

              <button
                type="submit"
                className={styles.submit}
                disabled={
                  busy || !name || !email || !message || rating === 0
                }
              >
                {busy ? "Enviando…" : "Enviar feedback"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
