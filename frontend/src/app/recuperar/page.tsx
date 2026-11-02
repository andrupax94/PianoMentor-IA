// description: Página /recuperar — formulario para pedir el enlace de reset (U-007).
// context: Ruta propia sin modales, misma estética que el wizard de registro.
import { AppHeader } from "../../components/AppHeader/AppHeader";
import AuthShell from "./AuthShell";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata = {
  title: "Recuperar contraseña · PianoMentor AI",
  description: "Pide un enlace para restablecer tu contraseña de PianoMentor AI.",
};

export default function RecuperarPage() {
  return (
    <div className="shell">
      <AppHeader />
      <AuthShell
        title="Recupera tu contraseña"
        hint="Te enviaremos un enlace para elegir una contraseña nueva."
      >
        <ForgotPasswordForm />
      </AuthShell>
    </div>
  );
}