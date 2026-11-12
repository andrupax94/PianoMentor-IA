// description: Layout global de la aplicación web.
// context: Envoltorio común de páginas: carga Tailwind (globals.css con @import tailwindcss + @config al tema de Stitch), los estilos globales, la fuente Manrope (next/font) y los <link> de Google Fonts para Material Symbols y JetBrains Mono; monta AgentDock. Bootstrap retirado el 2026-11-12.

import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { AgentDock } from "../components/AgentDock/AgentDock";
// Bootstrap y su extensión de fracciones de columna se han retirado (2026-11-12):
// Tailwind (grid/flex/gap) cubre el mismo layout sin otro framework CSS.
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "PianoMentor AI",
  description: "Práctica de piano adaptativa con IA",
  icons: {
    icon: "/assets/icons/Logo.svg",
    apple: "/assets/icons/Logo.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={manrope.variable}>
      <body>
        {/* Iconos Material Symbols (los que usa el HTML de Stitch) + JetBrains Mono para código.
            React 19 iza estos <link> al <head> (App Router no admite <head> manual). */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&family=JetBrains+Mono:wght@400;500;600;700&display=block"
        />
        {children}
        {/* El chat del mentor en la página principal; flotante en el resto. */}
        <AgentDock />
      </body>
    </html>
  );
}
