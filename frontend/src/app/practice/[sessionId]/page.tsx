// description: Página de una sesión de práctica concreta.
// context: B-012.1; monta la vista que envía las notas y pinta el estado en vivo.

import { PracticeSession } from "../../../components/PracticeSession";

type PracticePageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function PracticePage({ params }: PracticePageProps) {
  const { sessionId } = await params;

  return (
    <main className="shell">
      <p className="eyebrow">SESIÓN DE PRÁCTICA</p>
      <h1>Sesión {sessionId}</h1>
      <p className="intro">
        Lo que tocas viaja al servidor por WebSocket y vuelve como estado de la sesión. La
        evaluación y las acciones del agente llegan en las siguientes iteraciones.
      </p>
      <PracticeSession sessionId={sessionId} />
    </main>
  );
}
