---
name: PianoMentor AI
description: Mentor virtual de piano con IA: evalúa la interpretación y propone intervenciones limitadas sobre piezas MIDI.
colors:
  bg: "#0c1829"
  bg2: "#172338"
  panel: "#0f1a2e"
  panel-soft: "#12203a"
  line: "#1a2a47"
  line-strong: "#243659"
  line2: "#a200ff93"
  accent: "#83a9d2"
  text: "#e8eefb"
  text-soft: "#aeb9d0"
  text-mute: "#7f8ca6"
  error: "#ff8b8b"
  gold: "#f5a623"
  gold-soft: "#f5c04a"
  gold-usoft: "#8f8c7a"
  gold-t: "#f5bf4a27"
  blue: "#3f78b8"
  color1: "#fbb22a"
  color2: "#4d0064b7"
  hand-left: "#a4d1fd"
  hand-right: "#fbcb7e"
  hand-unknown: "#62e6c7"
  hand-agent: "#b388ff"
typography:
  display:
    fontFamily: "Gabriola, serif"
    fontSize: "clamp(2.4rem, 7vw, 5rem)"
    fontWeight: 700
    lineHeight: 0.98
  body:
    fontFamily: "Manrope, Reem Kufi, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, Reem Kufi, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    letterSpacing: "0.14em"
rounded:
  sm: "8px"
spacing:
  sm: "12px"
  md: "16px"
  lg: "36px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#07110f"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    typography: body
  button-primary-hover:
    backgroundColor: "{colors.gold}"
    textColor: "#07110f"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    typography: body
---

# Design System: PianoMentor AI

## Overview

**Creative North Star: "The Midnight Recital"**

PianoMentor AI es un mentor de piano virtual con IA. Su interfaz evoca una sala de concierto a media luz: un navy profundo (`--bg` #0c1829) sobre el que flotan superficies de cristal (glassmorphism) y acentos en oro (`--gold` #f5a623) y azul acero (`--accent` #83a9d2). La atmósfera es nocturna, concentrada y pedagógica: el piano virtual y la cascada de notas son el protagonista; la UI recede para dejar el escenario al estudiante y al agente. La densidad es media-alta en el área de práctica (teclado, cascada, métricas) y más respirada en la biblioteca y los diálogos.

**Key Characteristics:**
- Color-scheme oscuro por defecto; fondos navy en capas (bg → panel → panel-soft).
- Un único acento primario (azul acero) para acciones principales; el oro se reserva para estados destacados, métricas y la mano derecha de la cascada.
- Glassmorphism (backdrop-blur 5px) en contenedores flotantes, sobre fondos navy.
- Tipografía de contraste: Gabriola para titulares/display, Manrope para cuerpo y datos.
- Bootstrap únicamente para el sistema de grid; el resto es CSS Modules con tokens.

## Colors

Paleta navy profundo + oro, con azul acero como acento de acción y violeta para la IA acompañante.

### Primary
- **Steel Blue** (#83a9d2): color de acción principal (botones, enlaces, eyebrow). Único acento de interacción; su rareza es el punto.

### Secondary
- **Gold** (#f5a623, soft #f5c04a): estados destacados, métricas, mano derecha de la cascada y `accent-color` de los inputs numéricos.

### Tertiary
- **Amber** (#fbb22a) y **Violet** (#b388ff / #4d0064b7): la IA acompañante (mano agente) y acentos secundarios de la cascada.

### Neutral
- **Deep Navy** (#0c1829): fondo base de la página.
- **Navy Panel** (#0f1a2e / #12203a / #172338): superficies y paneles en capas.
- **Line** (#1a2a47 / #243659): bordes y separadores.
- **Text** (#e8eefb / #aeb9d0 / #7f8ca6): primario, suave y mudo sobre fondos oscuros.
- **Error** (#ff8b8b): avisos y errores accesibles en texto.
- **Hand colors**: izquierda #a4d1fd, derecha #fbcb7e, sin mano #62e6c7, agente #b388ff.

Los gradientes `--gradient1/2/3` (azul→dorado, dorado, azul→dorado) se usan en la línea final de la cascada y en acentos decorativos; no son tokens de color únicos sino composiciones.

**The One Voice Rule.** El acento primario (azul acero) se usa en ≤10 % de cualquier pantalla. Su rareza es el punto; el oro y el violeta son aún más escasos y con significado semántico (mano, IA).

## Typography

**Display Font:** Gabriola (serif, caligráfica) para titulares y la identidad de la marca.
**Body Font:** Manrope (sans-serif), con Reem Kufi como reserva, para cuerpo, datos y UI.

**Character:** Gabriola aporta calidez y carácter "piano/clásico" a los titulares; Manrope aporta legibilidad y neutralidad técnica al cuerpo, las métricas y los controles.

### Hierarchy
- **Display** (700, clamp(2.4rem, 7vw, 5rem), line-height 0.98): titulares de página y secciones principales.
- **Body** (400, 1rem, line-height 1.5): párrafos, controles y texto general.
- **Label** (400, 0.75rem, letter-spacing 0.14em): eyebrow, etiquetas uppercase y metadatos.

### Named Rules
**The Two Voices Rule.** Solo dos familias tipográficas: Gabriola para display/identidad y Manrope para todo lo demás. No introducir fuentes adicionales sin justificación.

## Layout

Modelo espacial basado en el grid de Bootstrap (12 columnas) más extensiones propias de medios enteros (`.col-{n}-5`, 1,5…11,5 columnas) en `grid-fractions.css`. Contenedor principal `.shell` con `max-width: 2200px`, flex en columna y `min-height: 100vh/100dvh`. Grid de tarjetas: `repeat(auto-fit, minmax(280px, 1fr))` con gap 16px y margen 36px vertical. Media queries por componente a 1000px, 900px y 480px; `prefers-reduced-motion: reduce` para animaciones.

## Elevation & Depth

Híbrido: superficies planas por defecto (fondos navy en capas), con glassmorphism (backdrop-filter blur 5px + sombra suave 0 4px 30px rgba(0,0,0,0.1–0.2)) en contenedores flotantes, tarjetas y estados hover. Un brillo inset blanco (`shadow1`: white 0px 0px 50px -40px inset) se usa como acento de profundidad en superficies destacadas. Las sombras son ambientales, no estructurales.

### Shadow Vocabulary
- **Inset glow** (`box-shadow: white 0px 0px 50px -40px inset`): brillo suave en superficies destacadas.
- **Glass card** (`box-shadow: 0 4px 30px rgba(0,0,0,0.1–0.2)`): contenedores flotantes con backdrop-blur.

### Named Rules
**The Flat-By-Default Rule.** Las superficies son planas en reposo. Las sombras y el blur aparecen solo como respuesta a estado (hover, elevación, foco) o en contenedores flotantes.

## Shapes

Lenguaje de formas sobrio: esquinas redondeadas de 8px en botones y controles; contenedores de cristal con backdrop-blur y esquinas según el componente (sin radio global exagerado). Bordes finos (`--line`, `--line-strong`) para separación, sin bordes gruesos ni decorativos.

## Components

### Buttons
- **Shape:** esquinas redondeadas (8px).
- **Primary:** fondo azul acero (#83a9d2), texto #07110f, padding 12px 16px, peso 700.
- **Hover:** fondo oro (#f5a623), texto #07110f.
- **Secondary / Ghost:** según el componente, siempre con tokens (sin `.btn` de Bootstrap).

### Glass Panels (cristal)
- **Style:** fondo `rgba(255,255,255,0.08)` o `color-mix(in srgb, var(--bg2) 20–70%, transparent)`, backdrop-filter blur(5px), sombra suave.
- **Variantes:** `.cristal`, `.cristal-azul`, `.cristal-azul-min`, `.cristal-azul-max`.

### Inputs
- **Style:** `accent-color: var(--gold)` en inputs numéricos; spin buttons con opacidad 0.55 en reposo y 1 en hover/foco.

### Navigation
- Estilo y estados por componente (CSS Modules); tipografía Manrope; estados default/hover/active con tokens.

### Piano Stage (signature)
- Teclado virtual SVG con 88 teclas, distribución partida (17 semitonos por mano), colores de mano de la cascada (azul izquierda, ámbar derecha, verde sin mano, violeta IA).

## Do's and Don'ts

### Do:
- **Do** usar siempre los tokens de `globals.css` (`var(--*)`); un color nuevo se añade primero como token.
- **Do** usar Bootstrap únicamente para grid (container, row, col, display, flex, align, justify, gap propio `.g-*`).
- **Do** usar CSS Modules por componente (`X.module.css`) y el trío `.tsx/.module.css/.types.ts`.
- **Do** respetar `prefers-reduced-motion: reduce`.
- **Do** mantener color-scheme dark.

### Don't:
- **Don't** importar `bootstrap.css` ni `bootstrap-utilities.css` (solo `bootstrap-grid.css`).
- **Don't** usar clases de componentes de Bootstrap (`.btn`, `.card`, `.nav`, `.modal`, `.alert`, `.dropdown`, `.bg-*`, `.text-*`, `.m-*`, `.p-*`).
- **Don't** usar `.gap-*` de Bootstrap (no está en el grid); escribir `gap` en el módulo.
- **Don't** hardcodear colores fuera de los tokens.
- **Don't** copiar el HTML de Stitch tal cual: adaptarlo a componentes React, tokens y CSS Modules.
- **Don't** adoptar la identidad de Stitch ("Acoustic Intelligence": tema claro, violeta, Epilogue/Plus Jakarta Sans/JetBrains Mono). Sus pantallas son referencia exploratoria; la identidad real es "The Midnight Recital" (oscuro, navy+oro, Gabriola+Manrope). Ver `docs/design/stitch/README.md`.