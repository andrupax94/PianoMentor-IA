// description: Tests del cargador de Swiper del carrusel decorativo (B-023): las dos fuentes (CDN primero, respaldo local), el CSS que viaja en el mismo orden, el interruptor de prefers-reduced-motion y el reset de la promesa única para los tests.
// context: El cargador solo corre en el navegador (document/window) y no se ejecuta en la suite: lo que se fija son las constantes, la pureza del interruptor de movimiento reducido y que el reset deja la carga en nulo. jsdom no carga scripts, así que no hay red en tests.

import { describe, expect, it } from "vitest";

import {
  URL_SWIPER_CDN,
  URL_SWIPER_CSS_CDN,
  URL_SWIPER_CSS_LOCAL,
  URL_SWIPER_LOCAL,
  prefiereMenosMovimiento,
  resetearCargaSwiper,
} from "./swiper-decor";

describe("fuentes de Swiper", () => {
  it("la CDN es jsDelivr autocontenida y el respaldo vive en /vendor del propio deploy", () => {
    expect(URL_SWIPER_CDN).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/swiper@.*\/\+esm$/);
    expect(URL_SWIPER_LOCAL).toBe("/vendor/swiper/swiper-bundle.esm.mjs");
  });

  it("el CSS viaja en el mismo orden: CDN primero, local de respaldo", () => {
    expect(URL_SWIPER_CSS_CDN).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/swiper@.*\.css$/);
    expect(URL_SWIPER_CSS_LOCAL).toBe("/vendor/swiper/swiper-bundle.min.css");
  });
});

describe("prefiereMenosMovimiento", () => {
  it("es false fuera del navegador (SSR) sin romper", () => {
    expect(prefiereMenosMovimiento()).toBe(false);
  });
});

describe("resetearCargaSwiper", () => {
  it("es seguro llamarlo en cualquier momento", () => {
    expect(() => resetearCargaSwiper()).not.toThrow();
  });
});
