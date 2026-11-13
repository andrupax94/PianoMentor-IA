// description: Carrusel Cover Flow del panel del mentor (B-023, opción Cover Flow): ocupa el sitio de la pestaña «Carga pieza» cuando la subida de MIDI está deshabilitada para la prueba pública. Muestra las piezas del corpus reales (catálogo GET /pieces: portada + nombre de la pieza + compositor; sin portada se descartan) con Swiper cargado en runtime (CDN → local): efecto coverflow, autoplay que se pausa al tocar/hover, 3 visibles (el panel es estrecho para 5), alto fijo de 150 px y overflow oculto. Si el catálogo no llega, cae a los retratos de compositores estáticos; si ni la CDN ni el respaldo cargan, a una píldora estática sin error.
// context: Decisión del usuario (opción B): el peso de la librería no viaja en el bundle de Vercel — se carga en runtime (CDN → /vendor/swiper local) solo cuando este bloque se monta, y solo se monta sin sesión con la subida apagada: en sesiones el panel muestra «Rendimiento» y el carrusel nunca se carga. Decorativo: sin navegación a pieza alguna (aria-hidden). Dos efectos encadenados: cargar la librería (la CLASE no puede ir directa al setState: React la invocaría como updater) y, con el contenedor ya en el DOM, inicializar; las slides se fijan ANTES de inicializar (el catálogo y la librería corren en paralelo y el Swiper nace con las carátulas buenas). El loop necesita slides de sobra: el fondo se cicla hasta 6.

"use client";

import { useEffect, useRef, useState } from "react";

import { getPieceList } from "../../../lib/api-client";
import {
  cargarSwiper,
  prefiereMenosMovimiento,
  type SwiperConstructor,
  type SwiperInstancia,
} from "../../../lib/swiper-decor";
import styles from "./MentorDecor.module.css";

/** Los retratos del corpus (public/assets/covers, dominio público; CREDITS.md):
 * la caída cuando el catálogo no está disponible. */
const CARATULAS = [
  { src: "/assets/covers/bach.jpg", titulo: "J. S. Bach", autor: "" },
  { src: "/assets/covers/beethoven.jpg", titulo: "L. van Beethoven", autor: "" },
  { src: "/assets/covers/mozart.jpg", titulo: "W. A. Mozart", autor: "" },
  { src: "/assets/covers/chopin.jpg", titulo: "F. Chopin", autor: "" },
];

interface Caratula {
  src: string;
  /** Nombre de la pieza (o del compositor en la caída estática). */
  titulo: string;
  autor: string;
}

/** El loop de Swiper necesita slides de sobra con 3 visibles: cicla el fondo. */
function ciclar(base: Caratula[]): Caratula[] {
  const slides: Caratula[] = [...base];
  let ronda = 0;
  while (slides.length < 6 && ronda < 4) {
    slides.push(...base);
    ronda += 1;
  }
  return slides;
}

export function MentorDecor() {
  const contenedor = useRef<HTMLDivElement>(null);
  /** El constructor llega de la carga (CDN → local); null mientras tanto. */
  const [constructorSwiper, setConstructorSwiper] = useState<SwiperConstructor | null>(null);
  /** Las carátulas: piezas reales del catálogo o, si no llega, los retratos. */
  const [slides, setSlides] = useState<Caratula[]>(CARATULAS);
  /** True cuando el catálogo ya resolvió (bien o mal): el Swiper nace con las
   * carátulas definitivas, no a medias. */
  const [datosListos, setDatosListos] = useState(false);
  const instanciaRef = useRef<SwiperInstancia | null>(null);

  // 1. Catálogo de piezas (paralelo a la carga de la librería).
  useEffect(() => {
    let montado = true;
    getPieceList("corpus")
      .then((piezas) => {
        if (!montado) return;
        const base = piezas
          .filter((p) => !!p.cover)
          .map((p) => ({
            src: p.cover ?? "",
            titulo: p.title || p.id,
            autor: p.composer ?? "",
          }));
        setSlides(base.length > 0 ? ciclar(base) : CARATULAS);
      })
      .catch(() => {
        // Sin catálogo: los retratos estáticos siguen siendo la cara bonita.
        if (montado) setSlides(CARATULAS);
      })
      .finally(() => {
        if (montado) setDatosListos(true);
      });
    return () => {
      montado = false;
    };
  }, []);

  // 2. Cargar la librería (CDN → respaldo local) y revelar el carrusel.
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

  // 3. Con la librería, el catálogo resuelto y el contenedor en el DOM,
  // inicializar. Las slides ya son las definitivas.
  useEffect(() => {
    if (!datosListos || !constructorSwiper || !contenedor.current || instanciaRef.current) return;
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
  }, [datosListos, constructorSwiper]);

  return (
    <section className={styles.decor} aria-hidden="true">
      {datosListos && constructorSwiper ? (
        <div ref={contenedor} className={styles.swiper}>
          <div className="swiper-wrapper">
            {slides.map((caratula, index) => (
              <div className="swiper-slide" key={`${caratula.titulo}-${index}`}>
                <figure className={styles.slide}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={caratula.src} alt="" className={styles.caratula} loading="lazy" />
                  <figcaption className={styles.epigrafes}>
                    <span className={styles.titulo}>{caratula.titulo}</span>
                    {caratula.autor && <span className={styles.autor}>{caratula.autor}</span>}
                  </figcaption>
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
