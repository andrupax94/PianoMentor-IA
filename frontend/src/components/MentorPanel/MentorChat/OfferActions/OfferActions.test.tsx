// description: Tests de la franja de respuestas a la oferta del mentor (B-032.7): en «pending» las dos píldoras; en «repeat» solo «Otra vez», deshabilitado por el tope anti-nag o por la respuesta en viaje; y sin caja propia.
// context: Criterio de B-032.7; se renderiza a HTML con react-dom/server (sin DOM ni navegador) para comprobar el contrato del componente.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { OfferActions } from "./OfferActions";

const callbacks = {
  onAccept: vi.fn(),
  onDismiss: vi.fn(),
  onRepeat: vi.fn(),
};

describe("OfferActions", () => {
  it("en «pending» responde con «Sigo yo» y «Sí, muéstralo»", () => {
    const html = renderToStaticMarkup(
      <OfferActions mode="pending" {...callbacks} />,
    );

    expect(html).toContain("Sigo yo");
    expect(html).toContain("Sí, muéstralo");
    expect(html).not.toContain("Otra vez");
  });

  it("en «repeat» solo ofrece repetir", () => {
    const html = renderToStaticMarkup(
      <OfferActions mode="repeat" {...callbacks} />,
    );

    expect(html).toContain("Otra vez");
    expect(html).not.toContain("Sí, muéstralo");
    expect(html).not.toContain("Sigo yo");
  });

  it("el tope anti-nag deshabilita el «Otra vez»", () => {
    const html = renderToStaticMarkup(
      <OfferActions mode="repeat" repeatUsed {...callbacks} />,
    );

    expect(html).toContain("Otra vez");
    expect(html).toMatch(/aria-busy="true"/);
  });

  it("con la respuesta en viaje quedan deshabilitadas las dos píldoras", () => {
    const html = renderToStaticMarkup(
      <OfferActions mode="pending" disabled {...callbacks} />,
    );

    expect(html).toMatch(/disabled=""[^>]*>Sigo yo</);
    expect(html).toMatch(/aria-busy="true"[\s\S]*>Sí, muéstralo</);
  });
});
