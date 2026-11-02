// description: Página /recuperar/[token] — formulario para restablecer la contraseña.
// context: Recibe el token de la URL y muestra el formulario de reset; incluye el
// header como el resto de páginas de auth.
import { AppHeader } from "../../../components/AppHeader/AppHeader";
import ResetPasswordClient from "./ResetPasswordClient";

export default function ResetPasswordPage() {
  return (
    <div className="shell">
      <AppHeader />
      <ResetPasswordClient />
    </div>
  );
}