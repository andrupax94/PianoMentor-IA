// description: Tests de la tarjeta de la oferta del mentor (B-032.7): en «pending» pregunta con las dos respuestas; en «repeat» solo ofrece «Otra vez», deshabilitado por el tope anti-nag.
// context: Criterio de B-032.7; se renderiza a HTML con react-dom/server (sin DOM ni navegador) para comprobar el contrato del componente.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { OfferCard } from "./OfferCard";

const callbacks = {
  onAccept: vi.fn(),
  onDismiss: vi.fn(),
  onRepeat: vi.fn(),
};

describe("OfferCard", () => {
  it("en «pending» pregunta con las dos respuestas del alumno", () => {
    const html = renderToStaticMarkup(
      <OfferCard mode="pending" question="¿Te muestro el compás 3?" {...callbacks} />,
    );

    expect(html).toContain("¿Te muestro el compás 3?");
    expect(html).toContain("Sí, muéstralo");
    expect(html).toContain("Sigo yo");
    expect(html).not.toContain("Otra vez");
  });

  it("en «repeat» solo ofrece repetir", () => {
    const html = renderToStaticMarkup(
      <OfferCard mode="repeat" question="¿Repetimos la demostración?" {...callbacks} />,
    );

    expect(html).toContain("Otra vez");
    expect(html).not.toContain("Sí, muéstralo");
    expect(html).not.toContain("Sigo yo");
  });

  it("el tope anti-nag deshabilita el «Otra vez»", () => {
    const html = renderToStaticMarkup(
      <OfferCard mode="repeat" question="¿Repetimos la demostración?" repeatUsed {...callbacks} />,
    );

    expect(html).toMatch(/disabled[^>]*>Otra vez</);
  });
});
