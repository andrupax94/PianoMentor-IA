// description: Compatibilidad de la ruta antigua de práctica: redirige a /{sessionId}.
// context: B-012.1 nació en /practice/{id}; la reposición mueve la práctica a la portada con el id en la URL, y este enlace viejo no se rompe (marcadores, guion de demo, pruebas manuales).

import { redirect } from "next/navigation";

type PracticePageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function PracticePage({ params }: PracticePageProps) {
  const { sessionId } = await params;
  redirect(`/${sessionId}`);
}
