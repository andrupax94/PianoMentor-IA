// description: Página de una sesión de práctica concreta.
// context: Vista de tocar, evaluar y ver al agente.

type PracticePageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function PracticePage({ params }: PracticePageProps) {
  const { sessionId } = await params;

  return (
    <main className="shell">
      <p className="eyebrow">SESIÓN DE PRÁCTICA</p>
      <h1>Sesión {sessionId}</h1>
      <p className="intro">La evaluación y la conexión en tiempo real se implementarán en la siguiente iteración.</p>
    </main>
  );
}
