// description: Página del registro por pasos (U-006).
// context: Ruta propia con el wizard; sin box ni modales. El cuerpo es todo
// cliente (RegisterWizard); aquí solo reconocer la página y su metadata.

import RegisterWizard from "../../components/Register/RegisterWizard";

export const metadata = {
  title: "Crear cuenta · PianoMentor AI",
  description: "Crea tu cuenta de PianoMentor AI en tres pasos.",
};

export default function RegistroPage() {
  return <RegisterWizard />;
}
