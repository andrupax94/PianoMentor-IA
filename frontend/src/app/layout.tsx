// description: Layout global de la aplicación web.
// context: Envoltorio común de páginas: carga el grid de Bootstrap (solo layout, antes de globals), los estilos globales y monta AgentDock.

import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { AgentDock } from "../components/AgentDock/AgentDock";
// Bootstrap reducido a su sistema de grid (contenedores, columnas, display, flex
// y alineación), sin reboot ni componentes: va antes de globals.css para que los
// estilos propios ganen en empates. Solo se aplica a código nuevo (skill CSS).
import "bootstrap/dist/css/bootstrap-grid.css";
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
