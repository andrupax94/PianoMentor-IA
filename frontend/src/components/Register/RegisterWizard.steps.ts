// description: Datos y lógica pura del wizard de registro (U-006).
// context: Lo consume RegisterWizard.tsx; vive aparte para que Vitest pueda
// cubrir los pasos, la validación y el mapeo de errores sin DOM ni red.

/** Pasos con id, título y subtítulo; los extras solo con el interruptor activo. */
export interface WizardStep {
  id: "basic" | "level" | "genres" | "terms" | "email";
  label: string;
  hint: string;
  /** Paso adicional (géneros/términos): desactivado hasta P-001. */
  extra?: boolean;
}

export const ALL_STEPS: readonly WizardStep[] = [
  { id: "basic", label: "Tus datos", hint: "Correo y contraseña para entrar." },
  { id: "level", label: "Tu nivel", hint: "Para adaptar las piezas y el profesor IA." },
  { id: "genres", label: "Tu música", hint: "Géneros que te gustaría tocar.", extra: true },
  { id: "terms", label: "Términos", hint: "Última comprobación legal.", extra: true },
  { id: "email", label: "Verifica tu correo", hint: "Activa la cuenta con el enlace." },
];

/** Interruptor de alcance (U-006): con `false` el wizard se ve de 3 pasos. */
export function visibleSteps(enableExtra: boolean): WizardStep[] {
  return ALL_STEPS.filter((step) => enableExtra || !step.extra).map((step) => ({ ...step }));
}

/** Datos y respuesta del formulario, tal y como los maneja el wizard. */
export interface WizardForm {
  displayName: string;
  email: string;
  password: string;
  confirm: string;
  level: string;
  genres: string[];
  acceptedTerms: boolean;
}

export const INITIAL_FORM: WizardForm = {
  displayName: "",
  email: "",
  password: "",
  confirm: "",
  level: "",
  genres: [],
  acceptedTerms: false,
};

export const LEVELS: readonly { value: string; label: string }[] = [
  { value: "beginner", label: "Principiante total" },
  { value: "basic", label: "Sé lo básico pero sin soltura" },
  { value: "intermediate", label: "Sé tocar piezas sencillas" },
  { value: "advanced", label: "Nivel medio o avanzado" },
];

export const GENRES: readonly string[] = [
  "Clásica",
  "Pop",
  "Rock",
  "Jazz",
  "Blues",
  "Latina",
  "Cine y videojuegos",
  "Electrónica",
];

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ValidatableStep = WizardStep["id"];

/** Errores por campo (clave igual que WizardForm) más el genérico `server`. */
export type WizardErrors = Partial<Record<keyof WizardForm | "server", string>>;

/** Validación mínima por paso (U-006): errores suaves, texto en claro. */
export function validateStep(step: ValidatableStep, form: WizardForm): WizardErrors {
  const errors: WizardErrors = {};
  if (step === "basic") {
    if (!EMAIL_RE.test(form.email)) errors.email = "Escribe un correo válido.";
    if (form.password.length < 8) errors.password = "Usa al menos 8 caracteres.";
    if (form.confirm !== form.password) errors.confirm = "Las contraseñas no coinciden.";
  }
  if (step === "level" && !form.level) {
    errors.level = "Elige el nivel que mejor te describe.";
  }
  if (step === "terms" && !form.acceptedTerms) {
    errors.acceptedTerms = "Debes aceptar los términos para continuar.";
  }
  return errors;
}

/** Mapea un ApiError del backend al campo del formulario que le toca. */
export function errorForCode(code: string | null, fallback: string): {
  field: keyof WizardForm | "server";
  message: string;
} {
  switch (code) {
    case "auth_email_exists":
      return { field: "email", message: "Este correo ya está registrado. Prueba a iniciar sesión." };
    case "auth_invalid_email":
      return { field: "email", message: "Escribe un correo válido." };
    case "auth_weak_password":
      return { field: "password", message: "Usa al menos 8 caracteres." };
    case "auth_invalid_level":
      return { field: "level", message: "Elige el nivel que mejor te describe." };
    case "auth_invalid_genre":
      return { field: "server", message: "Género no reconocido: repasa la selección." };
    default:
      return { field: "server", message: fallback };
  }
}
