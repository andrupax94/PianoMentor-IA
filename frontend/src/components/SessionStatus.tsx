export function SessionStatus() {
  return (
    <section className="panel">
      <h2>Estado de sesión</h2>
      <p>Modo: <strong>WAITING</strong></p>
      <p>Control: <strong>ESTUDIANTE</strong></p>
      <button type="button" disabled>Crear sesión próximamente</button>
    </section>
  );
}
