// description: Tests del selector de modo de práctica (B-032.4): los tres modos con el vigente marcado, el interruptor de mano solo en «una mano», el aviso de que la IA tiene el piano y los botones deshabilitados mientras tanto.
// context: Criterio de B-032.4; se renderiza a HTML con `react-dom/server` (sin DOM ni navegador) para comprobar el contrato del componente.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PracticeModeSelector } from "./PracticeModeSelector";

describe("PracticeModeSelector", () => {
  it("enseña los tres modos con el vigente marcado", () => {
    const html = renderToStaticMarkup(
      <PracticeModeSelector mode="one_hand" hand="right" onChange={vi.fn()} />,
    );

    expect(html).toContain("Observar");
    expect(html).toContain("Una mano");
    expect(html).toContain("Dos manos");
    // El vigente va con aria-pressed="true".
    expect(html).toMatch(/aria-pressed="true"[^>]*>Una mano</);
  });

  it("el interruptor de mano solo aparece en «una mano»", () => {
    const una = renderToStaticMarkup(
      <PracticeModeSelector mode="one_hand" hand="right" onChange={vi.fn()} />,
    );
    expect(una).toContain("Mano que practicas");
    expect(una).toContain("Izquierda");
    expect(una).toContain("Derecha");

    const observar = renderToStaticMarkup(
      <PracticeModeSelector mode="observe" hand="right" onChange={vi.fn()} />,
    );
    expect(observar).not.toContain("Mano que practicas");
  });

  it("con la IA al piano avisa y deshabilita los botones", () => {
    const html = renderToStaticMarkup(
      <PracticeModeSelector
        mode="one_hand"
        hand="right"
        suspended
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain("IA al piano");
    expect(html).toContain("disabled");
  });
});
