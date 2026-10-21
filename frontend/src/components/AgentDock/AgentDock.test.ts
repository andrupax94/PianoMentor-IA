// description: Tests del predicado del chat flotante: cuándo se ve y cuándo no.
// context: Criterio de B-012.8 bloque C; sin DOM. El componente no se renderiza
// (la suite no monta DOM): se prueba la decisión pura de mostrar u ocultar.

import { describe, expect, it } from "vitest";

import { shouldShowDock } from "./AgentDock";

describe("shouldShowDock", () => {
  it("se oculta en la página principal, donde ya está el chat del mentor", () => {
    expect(shouldShowDock("/")).toBe(false);
  });

  it("se ve en la biblioteca", () => {
    expect(shouldShowDock("/library")).toBe(true);
  });

  it("se oculta en una sesión de práctica, que es la portada con el id en la URL", () => {
    expect(shouldShowDock("/23252e42-a929-4c04-bde7-df2443758119")).toBe(false);
    expect(shouldShowDock("/23252E42-A929-4C04-BDE7-DF2443758119")).toBe(false);
  });

  it("cualquier ruta desconocida que no sea un id también lo muestra", () => {
    expect(shouldShowDock("/otra")).toBe(true);
    expect(shouldShowDock("/practice/s-1")).toBe(true);
  });

  it("sin pathname definido se muestra, para no dejar al usuario sin chat", () => {
    expect(shouldShowDock(null)).toBe(true);
  });
});
