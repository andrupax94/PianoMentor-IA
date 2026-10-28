// description: Tests de la lógica pura del wizard de registro (U-006).
// context: Criterio de U-006; se ejecutan con `npm run test` (Vitest). Sin
// DOM ni red: solo datos, validación por paso y mapeo de errores del backend.

import { describe, expect, it } from "vitest";

import {
  ALL_STEPS,
  EMAIL_RE,
  GENRES,
  INITIAL_FORM,
  LEVELS,
  errorForCode,
  validateStep,
  visibleSteps,
  type WizardForm,
} from "./RegisterWizard.steps";

const COMPLETE_FORM: WizardForm = {
  displayName: "Andrés",
  email: "nueva@gmail.com",
  password: "contrasena-larga-1234",
  confirm: "contrasena-larga-1234",
  level: "beginner",
  genres: ["Clásica"],
  acceptedTerms: true,
};

describe("visibleSteps", () => {
  it("con el interruptor a false el wizard se percibe de 3 pasos: 1, 2 y 5", () => {
    // Los extras (géneros, términos) quedan construidos pero ocultos: 2 → 5.
    const steps = visibleSteps(false);
    expect(steps.map((step) => step.id)).toEqual(["basic", "level", "email"]);
  });

  it("con el interruptor a true aparecen los cinco pasos en orden", () => {
    expect(visibleSteps(true).map((step) => step.id)).toEqual([
      "basic",
      "level",
      "genres",
      "terms",
      "email",
    ]);
  });

  it("usa siempre los mismos cinco pasos maestros", () => {
    expect(ALL_STEPS).toHaveLength(5);
  });
});

describe("validateStep", () => {
  it("el paso 1 exige correo válido, contraseña de 8 y confirmación", () => {
    expect(validateStep("basic", { ...COMPLETE_FORM, email: "no-valido" })).toMatchObject({
      email: expect.any(String),
    });
    expect(validateStep("basic", { ...COMPLETE_FORM, password: "corta" })).toMatchObject({
      password: expect.any(String),
    });
    expect(
      validateStep("basic", { ...COMPLETE_FORM, confirm: "otra-distinta-12345" }),
    ).toMatchObject({ confirm: expect.any(String) });
  });

  it("el paso 1 limpio no da errores", () => {
    expect(validateStep("basic", COMPLETE_FORM)).toEqual({});
  });

  it("el paso 2 exige un nivel elegido", () => {
    expect(validateStep("level", { ...COMPLETE_FORM, level: "" })).toMatchObject({
      level: expect.any(String),
    });
    expect(validateStep("level", COMPLETE_FORM)).toEqual({});
  });

  it("el paso de géneros es opcional: sin selección también pasa", () => {
    expect(validateStep("genres", { ...COMPLETE_FORM, genres: [] })).toEqual({});
  });

  it("el paso de términos exige la aceptación", () => {
    expect(validateStep("terms", { ...COMPLETE_FORM, acceptedTerms: false })).toMatchObject({
      acceptedTerms: expect.any(String),
    });
    expect(validateStep("terms", COMPLETE_FORM)).toEqual({});
  });
});

describe("errorForCode", () => {
  it("manda cada código del backend al campo del formulario que le toca", () => {
    expect(errorForCode("auth_email_exists", "respaldo")).toEqual({
      field: "email",
      message: expect.stringContaining("ya está registrado"),
    });
    expect(errorForCode("auth_invalid_email", "respaldo")).toMatchObject({ field: "email" });
    expect(errorForCode("auth_weak_password", "respaldo")).toMatchObject({ field: "password" });
    expect(errorForCode("auth_invalid_level", "respaldo")).toMatchObject({ field: "level" });
    expect(errorForCode("auth_invalid_genre", "respaldo")).toMatchObject({ field: "server" });
  });

  it("los códigos sin mapeo van al genérico con el mensaje del backend", () => {
    expect(errorForCode("auth_email_unverified", "Verifícalo")).toEqual({
      field: "server",
      message: "Verifícalo",
    });
    expect(errorForCode(null, "Sin conexión")).toEqual({
      field: "server",
      message: "Sin conexión",
    });
  });
});

describe("catálogos compartidos con el backend", () => {
  it("el email del front acepta los mismos correos que valida el backend", () => {
    expect(EMAIL_RE.test("nueva@gmail.com")).toBe(true);
    expect(EMAIL_RE.test("no-valido")).toBe(false);
  });

  it("los niveles del front coinciden con AUTH_LEVELS del backend", () => {
    // AUTH_LEVELS = beginner, basic, intermediate, advanced (schemas.py).
    expect(LEVELS.map((level) => level.value)).toEqual([
      "beginner",
      "basic",
      "intermediate",
      "advanced",
    ]);
  });

  it("los géneros del front coinciden con GENRES_UI del backend", () => {
    expect(GENRES).toContain("Cine y videojuegos");
    expect(GENRES).toHaveLength(8);
  });

  it("el formulario inicial empieza vacío y sin aceptaciones", () => {
    expect(INITIAL_FORM).toEqual({
      displayName: "",
      email: "",
      password: "",
      confirm: "",
      level: "",
      genres: [],
      acceptedTerms: false,
    });
  });
});
