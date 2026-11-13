// description: Carrusel decorativo del panel del mentor (B-023, opción Cover Flow): ocupa el sitio de la pestaña «Carga pieza» cuando la subida de MIDI está deshabilitada para la prueba pública. Carrusel de carátulas de compositores (los retratos de dominio público del corpus) con Swiper cargado de CDN con respaldo local: efecto coverflow, autoplay que se pausa al tocar/hover, 3 visibles (el panel es estrecho para 5) y alto fijo de 150 px.
// context: Decisión del usuario (opción B): el peso de la librería no viaja en el bundle de Vercel — se carga en runtime (CDN → /vendor/swiper local) solo cuando este bloque se monta, y solo se monta sin sesión con la subida apagada: en sesiones el panel muestra «Rendimiento» y el carrusel nunca carga. Sin red ni CDN el bloque degrada a una píldora estática sin error. aria-label mínimo; es decorativo, sin navegación a pieza alguna. 4 retratos × 2 = 8 slides para que el loop sea suave con 5 visibles.

"use client";

import { useEffect, useRef, useState } from "react";

import {
  cargarSwiper,
  prefiereMenosMovimiento,
  type SwiperConstructor,
  type SwiperInstancia,
} from "../../../lib/swiper-decor";
import styles from "./MentorDecor.module.css";

/** Los retratos del corpus (public/assets/covers, dominio público; CREDITS.md). */
const CARATULAS = [
  { src: "/assets/covers/bach.jpg", nombre: "J. S. Bach" },
  { src: "/assets/covers/beethoven.jpg", nombre: "L. van Beethoven" },
  { src: "/assets/covers/mozart.jpg", nombre: "W. A. Mozart" },
  { src: "/assets/covers/chopin.jpg", nombre: "F. Chopin" },
];

/** Duplicadas para que el loop sea suave con 5 slides visibles. */
const SLIDES = [...CARATULAS, ...CARATULAS];

export function MentorDecor() {
  const contenedor = useRef<HTMLDivElement>(null);
  /** El constructor llega de la carga (CDN → local); null mientras tanto. */
  const [constructorSwiper, setConstructorSwiper] = useState<SwiperConstructor | null>(null);
  const instanciaRef = useRef<SwiperInstancia | null>(null);

  // 1. Cargar la librería (CDN → respaldo local) y revelar el carrusel.
  useEffect(() => {
    let montado = true;
    cargarSwiper()
      .then((c) => {
        // La lambda evita que React invoque la CLASE como updater de estado.
        if (montado) setConstructorSwiper(() => c);
      })
      .catch(() => {
        // Sin CDN ni respaldo: la píldora estática es la caída honesta.
      });
    return () => {
      montado = false;
      instanciaRef.current?.destroy(true);
      instanciaRef.current = null;
    };
  }, []);

  // 2. Con el constructor y el contenedor ya en el DOM, inicializar. El ref se
  // llena en el render del carrusel (el de la píldora estática no lo tiene).
  useEffect(() => {
    if (!constructorSwiper || !contenedor.current || instanciaRef.current) return;
    instanciaRef.current = new constructorSwiper(contenedor.current, {
      effect: "coverflow",
      grabCursor: true,
      centeredSlides: true,
      // El panel es estrecho (~340 px): 3 carátulas grandes en vez de 5 cortadas.
      slidesPerView: 3,
      loop: true,
      speed: 700,
      coverflowEffect: {
        rotate: 22,
        stretch: 0,
        depth: 110,
        modifier: 1.2,
        slideShadows: false,
      },
      autoplay: {
        delay: 2_400,
        disableOnInteraction: false,
        pauseOnMouseEnter: true,
      },
      // Sin animación automática si el sistema pide menos movimiento.
      ...(prefiereMenosMovimiento() ? { autoplay: false } : {}),
    });
  }, [constructorSwiper]);

  return (
    <section className={styles.decor} aria-hidden="true">
      {constructorSwiper ? (
        <div ref={contenedor} className={styles.swiper}>
          <div className="swiper-wrapper">
            {SLIDES.map((caratula, index) => (
              <div className="swiper-slide" key={`${caratula.nombre}-${index}`}>
                <figure className={styles.slide}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={caratula.src} alt="" className={styles.caratula} loading="lazy" />
                  <figcaption className={styles.nombre}>{caratula.nombre}</figcaption>
                </figure>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.estatica}>
          <p className={styles.melodia}>♪ &nbsp; ♫ &nbsp; ♩ &nbsp; ♬</p>
          <p className={styles.frase}>La práctica lenta es la más rápida.</p>
        </div>
      )}
    </section>
  );
}
