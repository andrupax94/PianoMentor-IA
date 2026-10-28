// description: Wizard de registro por pasos (U-006): página propia, sin box.
// context: Cuenta el registro con datos básicos, nivel de piano y el email de
// comprobación; los pasos de géneros y términos están construidos pero
// desactivados (interruptor ENABLE_EXTRA_STEPS) hasta que P-001 publique los
// documentos legales. La cuenta la crea /api/v1/auth/register y queda
// inactiva; el step final pide el enlace de verificación del email.

"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";

import { ApiError, registerUser } from "../../lib/api-client";
import styles from "./register.module.css";
import {
  GENRES,
  INITIAL_FORM,
  LEVELS,
  type WizardErrors,
  type WizardStep,
  errorForCode,
  validateStep,
  visibleSteps,
} from "./RegisterWizard.steps";

/**
 * Interruptor de alcance (U-006): con `false` los steps 3 (géneros) y
 * 4 (términos) quedan construidos pero ocultos: el wizard se percibe como
 * de 3 pasos (2 → 5). Activar el step 4 requiere P-001 (documentos legales).
 */
const ENABLE_EXTRA_STEPS = false;

const REGISTER_FALLBACK = "No hemos podido crear la cuenta. Inténtalo de nuevo en unos minutos.";
const NETWORK_FALLBACK = "Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.";

export default function RegisterWizard() {
  const steps = visibleSteps(ENABLE_EXTRA_STEPS);
  const [index, setIndex] = useState(0);
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState<WizardErrors>({});
  const [sending, setSending] = useState(false);

  const current: WizardStep = steps[index];
  const isLast = index === steps.length - 1;
  const isSubmitStep = index === steps.length - 2; // el paso previo al email crea la cuenta
  const progress = ((index + 1) / steps.length) * 100;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined, server: undefined }));
  };

  async function submit() {
    setSending(true);
    setErrors((previous) => ({ ...previous, server: undefined }));
    try {
      await registerUser({
        email: form.email,
        password: form.password,
        display_name: form.displayName || null,
        level: form.level,
        genres: ENABLE_EXTRA_STEPS ? form.genres : null,
        accepted_terms: ENABLE_EXTRA_STEPS ? form.acceptedTerms : null,
      });
      setIndex(steps.length - 1);
    } catch (reason) {
      const code = reason instanceof ApiError ? reason.code : null;
      const message = reason instanceof ApiError ? reason.message : REGISTER_FALLBACK;
      const fallback = reason instanceof ApiError ? message || REGISTER_FALLBACK : NETWORK_FALLBACK;
      const mapped = errorForCode(code, fallback);
      setErrors({ [mapped.field]: mapped.message });
      // Correo reservado: vuelta al paso 1 para que el usuario elija.
      if (code === "auth_email_exists") {
        setIndex(steps.findIndex((step) => step.id === "basic"));
      }
    } finally {
      setSending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (isLast || sending) return;
    const found = validateStep(current.id, form);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (isSubmitStep) void submit();
    else setIndex((previous) => previous + 1);
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {/* Panel izquierdo: pasos sobre la foto de piano */}
        <aside className={styles.aside}>
          <div className={styles.asideContent}>
            <Link href="/" className={styles.brand}>
              <Image src="/assets/icons/logo.svg" alt="" width={28} height={28} />
              <span>
                PianoMentor <b>AI</b>
              </span>
            </Link>

            <div className={styles.asideIntro}>
              <h2>Crea tu cuenta</h2>
              <p>{current.hint}</p>
            </div>

            <ol className={styles.stepList}>
              {steps.map((step, stepIndex) => (
                <li
                  key={step.id}
                  className={`${styles.stepItem} ${stepIndex < index ? styles.done : ""} ${
                    stepIndex === index ? styles.active : ""
                  }`}
                  aria-current={stepIndex === index ? "step" : undefined}
                >
                  <span className={styles.bullet}>{stepIndex < index ? "✓" : stepIndex + 1}</span>
                  <span>{step.label}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        {/* Panel derecho: formulario del paso actual */}
        <section className={styles.panel}>
          <div className={styles.progressWrap}>
            <span className={styles.progressLabel}>
              Paso {index + 1} de {steps.length}
            </span>
            <div
              className={styles.progress}
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={steps.length}
              aria-valuenow={index + 1}
            >
              <div className={styles.progressBar} style={{ width: `${progress}%` }} />
            </div>
          </div>

          <form onSubmit={onSubmit} noValidate className={styles.form}>
            <h1 className={styles.title}>{current.label}</h1>

            {current.id === "basic" && (
              <div className={styles.fields}>
                <Field label="Nombre visible (opcional)" error={errors.displayName}>
                  <input
                    value={form.displayName}
                    onChange={(event) => set("displayName", event.target.value)}
                    autoComplete="nickname"
                  />
                </Field>
                <Field label="Correo" error={errors.email}>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => set("email", event.target.value)}
                    autoComplete="email"
                  />
                </Field>
                <Field label="Contraseña" error={errors.password}>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => set("password", event.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="Repite la contraseña" error={errors.confirm}>
                  <input
                    type="password"
                    value={form.confirm}
                    onChange={(event) => set("confirm", event.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
              </div>
            )}

            {current.id === "level" && (
              <div className={styles.fields} role="radiogroup" aria-label="Nivel de piano">
                <p className={styles.question}>¿Cuál es tu nivel de piano actual?</p>
                {LEVELS.map((level) => (
                  <label
                    key={level.value}
                    className={`${styles.option} ${form.level === level.value ? styles.selected : ""}`}
                  >
                    <input
                      type="radio"
                      name="level"
                      checked={form.level === level.value}
                      onChange={() => set("level", level.value)}
                    />
                    {level.label}
                  </label>
                ))}
                {errors.level && <p className={styles.error}>{errors.level}</p>}
              </div>
            )}

            {current.id === "genres" && (
              <div className={styles.chips}>
                {GENRES.map((genre) => {
                  const on = form.genres.includes(genre);
                  return (
                    <button
                      type="button"
                      key={genre}
                      aria-pressed={on}
                      className={`${styles.chip} ${on ? styles.selected : ""}`}
                      onClick={() =>
                        set("genres", on ? form.genres.filter((g) => g !== genre) : [...form.genres, genre])
                      }
                    >
                      {genre}
                    </button>
                  );
                })}
              </div>
            )}

            {current.id === "terms" && (
              <div className={styles.fields}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={form.acceptedTerms}
                    onChange={(event) => set("acceptedTerms", event.target.checked)}
                  />
                  <span>
                    Acepto los{" "}
                    {/* TODO(P-001): rutas reales cuando existan los documentos */}
                    <Link href="/legal/terminos" target="_blank">
                      términos y condiciones
                    </Link>{" "}
                    y la{" "}
                    <Link href="/legal/privacidad" target="_blank">
                      política de privacidad
                    </Link>
                    .
                  </span>
                </label>
                {errors.acceptedTerms && <p className={styles.error}>{errors.acceptedTerms}</p>}
              </div>
            )}

            {current.id === "email" && (
              <div className={styles.sent}>
                <p>
                  Hemos enviado un enlace de verificación a <b>{form.email}</b>. Ábrelo para activar tu
                  cuenta; caduca en 24 horas.
                </p>
                <Link href="/" className={styles.ghost}>
                  Ir a la app
                </Link>
              </div>
            )}

            {errors.server && <p className={styles.error}>{errors.server}</p>}

            {!isLast && (
              <div className={styles.actions}>
                {index > 0 ? (
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={() => setIndex((previous) => previous - 1)}
                    disabled={sending}
                  >
                    Atrás
                  </button>
                ) : (
                  <span />
                )}
                <button type="submit" className={styles.primary} disabled={sending}>
                  {sending ? "Creando cuenta…" : isSubmitStep ? "Crear cuenta" : "Siguiente"}
                </button>
              </div>
            )}
          </form>

          {index === 0 && (
            <p className={styles.alt}>
              ¿Ya tienes cuenta? <Link href="/">Inicia sesión</Link>
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
      {error && <small className={styles.error}>{error}</small>}
    </label>
  );
}
