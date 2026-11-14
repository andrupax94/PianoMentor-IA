// description: Tests del chip píldora del chat: etiqueta por defecto «Pedir pista al agente», etiqueta configurable para las respuestas a la oferta del mentor (B-032.7) e icono omitible.
// context: Se renderiza a HTML con react-dom/server (sin DOM ni navegador) para comprobar el contrato del componente.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AgentHintButton } from "./AgentHintButton";

describe("AgentHintButton", () => {
  it("pide la pista con su etiqueta por defecto y la estrella", () => {
    const html = renderToStaticMarkup(
      <AgentHintButton onAsk={vi.fn()} />,
    );

    expect(html).toContain("Pedir pista al agente");
    expect(html).toMatch(/<span[^>]*stars/);
  });

  it("reutiliza la píldora con otra etiqueta y sin icono (oferta del mentor)", () => {
    const html = renderToStaticMarkup(
      <AgentHintButton label="Sí, muéstralo" icon={false} onAsk={vi.fn()} />,
    );

    expect(html).toContain("Sí, muéstralo");
    expect(html).not.toContain("Pedir pista al agente");
    expect(html).not.toMatch(/<span[^>]*stars/);
  });

  it("deshabilitado marca aria-busy y no responde", () => {
    const html = renderToStaticMarkup(
      <AgentHintButton label="Otra vez" disabled onAsk={vi.fn()} />,
    );

    expect(html).toContain("Otra vez");
    expect(html).toMatch(/aria-busy="true"/);
    expect(html).toMatch(/disabled/);
  });

  it("B-033.8: modo informe cambia etiqueta e icono y lleva la clase destacada", () => {
    const html = renderToStaticMarkup(
      <AgentHintButton modo="informe" onAsk={vi.fn()} />,
    );

    expect(html).toContain("Ver informe de la práctica");
    expect(html).not.toContain("Pedir pista al agente");
    expect(html).toMatch(/<span[^>]*informIcon/); // inform.svg con mask-image
    expect(html).not.toMatch(/<span[^>]*stars/);
    expect(html).toMatch(/chipInforme/); // más grande y oro desde el inicio
  });
});
