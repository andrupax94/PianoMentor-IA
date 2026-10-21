// description: Portada con una sesión de práctica activa: monta el puente de la sesión.
// context: La práctica vive en /{id} sobre la portada (reposición post-B-012.1); el piano, el chat y el resto de la página ya están en el layout del grupo.

import { PracticeBridge } from "../../../components/PracticeBridge";

type PracticePageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function PracticePage({ params }: PracticePageProps) {
  const { sessionId } = await params;
  // key: si cambia el id en la ruta, el puente remonta y con él el reloj y el estado.
  return <PracticeBridge key={sessionId} sessionId={sessionId} />;
}
