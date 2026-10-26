// description: Tests del chat flotante: shouldShowDock (oculto en la principal y en /{id} UUID en la raíz, en minúsculas y mayúsculas; visible en Library, rutas desconocidas y sin pathname) y shouldCollapseOnNavigate (colapsa al cambiar de ruta).
// context: Criterios de B-012.8 bloque C y D-002.5; sin DOM: se prueban las decisiones puras de mostrar y de volver a cerrado, no el render.

import { describe, expect, it } from "vitest";

import { shouldCollapseOnNavigate, shouldShowDock } from "./AgentDock";

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

describe("shouldCollapseOnNavigate", () => {
  it("al cambiar de ruta el panel vuelve a cerrado", () => {
    expect(shouldCollapseOnNavigate("/library", "/otra")).toBe(true);
    expect(shouldCollapseOnNavigate("/otra", "/library")).toBe(true);
  });

  it("desde la primera ruta conocida también colapsa, aunque empezara abierto", () => {
    expect(shouldCollapseOnNavigate(null, "/library")).toBe(true);
  });

  it("con la misma ruta de nuevo se queda como estaba", () => {
    expect(shouldCollapseOnNavigate("/library", "/library")).toBe(false);
    expect(shouldCollapseOnNavigate(null, null)).toBe(false);
  });
});
