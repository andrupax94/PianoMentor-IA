import { MidiUploader } from "../components/MidiUploader";
import { PianoKeyboard } from "../components/PianoKeyboard";
import { SessionStatus } from "../components/SessionStatus";

export default function HomePage() {
  return (
    <main className="shell">
      <header>
        <p className="eyebrow">PIANOMENTOR AI · MVP</p>
        <h1>Tu práctica, observada y guiada.</h1>
        <p className="intro">Carga una pieza MIDI para comenzar una sesión de práctica.</p>
      </header>
      <section className="grid">
        <MidiUploader />
        <SessionStatus />
      </section>
      <PianoKeyboard />
    </main>
  );
}
