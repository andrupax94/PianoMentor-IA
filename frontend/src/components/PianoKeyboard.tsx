const KEYS = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5", "G5"];

export function PianoKeyboard() {
  return (
    <section className="panel">
      <h2>Piano virtual</h2>
      <p>Las notas esperadas aparecerán aquí.</p>
      <div className="keyboard" aria-label="Piano virtual">
        {KEYS.map((key) => <div className="key" key={key}>{key}</div>)}
      </div>
    </section>
  );
}
