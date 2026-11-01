// description: Página /registro del formulario por pasos (U-006).
// context: Ruta propia con el wizard; sin box ni modales. El cuerpo es todo
// cliente (RegisterWizard); aquí solo reconocer la página, su metadata y el
// header para que el acceso al login con contraseña esté disponible desde el
// propio registro: el botón «Iniciar sesión» del header abre el panel sin
// redirigir a la portada.

import { AppHeader } from "../../components/AppHeader/AppHeader";
import RegisterWizard from "../../components/Register/RegisterWizard";

export const metadata = {
  title: "Crear cuenta · PianoMentor AI",
  description: "Crea tu cuenta de PianoMentor AI en tres pasos.",
};

export default function RegistroPage() {
  return (
    <div className="shell">
      <AppHeader />
      <RegisterWizard />
    </div>
  );
}
