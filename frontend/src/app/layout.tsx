import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PianoMentor AI",
  description: "Práctica de piano adaptativa con IA",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
