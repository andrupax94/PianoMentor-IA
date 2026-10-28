// app/recuperar/page.tsx
import AuthShell from "./AuthShell";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata = { title: "Recuperar contraseña · PianoMentor AI" };

export default function RecuperarPage() {
  return (
    <AuthShell title="Recupera tu contraseña" hint="Te enviaremos un enlace para elegir una contraseña nueva.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
