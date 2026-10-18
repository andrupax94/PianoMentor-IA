// description: Layout global de la aplicación web.
// context: Envoltorio común de páginas; carga la tipografía del diseño (Manrope).

import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { AgentDock } from "../components/AgentDock/AgentDock";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "PianoMentor AI",
  description: "Práctica de piano adaptativa con IA",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={manrope.variable}>
      <body>
        {children}
        {/* El chat del mentor en la página principal; flotante en el resto. */}
        <AgentDock />
      </body>
    </html>
  );
}
