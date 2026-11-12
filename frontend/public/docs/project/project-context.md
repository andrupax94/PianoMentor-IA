# PianoMentor AI — Contexto de proyecto para Stitch

> Este documento describe la identidad y los contratos técnicos del frontend
> de PianoMentor AI para que las pantallas que Stitch genere se integren
> directamente, sin re-interpretación.

## Identidad visual

- Tema: **oscuro**. Navy profundo + oro.
- Tipografías: **Manrope** (UI), **JetBrains Mono** (código/etiquetas mono), iconos **Material Symbols Outlined** (se cargan por Google Fonts en el layout raíz).
- Referencia de paleta: la que usa el proyecto en `tailwind.config.js` (surface `#0c1321`, surface-container `#19202e`, primary `#f2ca50`, secondary `#d3c5a8`, outline-variant `#4d4635`, on-surface `#dce2f6`).
- Las pantallas se pegan **con clases Tailwind tal cual las exporta Stitch** (Tailwind v4 con `@tailwindcss/postcss` + `@config` conectado a esta paleta). No traducir el HTML a otro sistema.

## Tokens del proyecto (`globals.css`)

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0c1829` | Fondo base del shell |
| `--bg2` | `#172338` | Fondo alterno / cristal azul |
| `--panel` | `#0f1a2e` | Paneles |
| `--text` | claro | Texto principal |
| `--accent` | `#83a9d2` | Acento del proyecto (azul claro) |
| `--gold` / `--gold-soft` | dorado | Acentos oro |
| `--line` / `--line-strong` | grises azules | Bordes |
| `--hand-left` / `--hand-right` | `#a4d1fd` / `#fbcb7e` | Cascada por mano |
| `--hand-agent` | `#b388ff` | Mano de la IA |
| `--hand-unknown` | `#62e6c7` | Partitura sin mano |

## Contratos de layout (obligatorios)

1. **Header siempre visible**: `AppHeader` (sticky, `cristal-azul-max`, ~64px de alto) en todas las vistas. Nunca generar pantallas sin él.
2. **Footer siempre visible**: `AppFooter` (barra minimizada de ~72px que se expande hacia arriba en overlay al hacer clic; maximizado puede tapar contenido, minimizado no). Las páginas nuevas deben usar `min-h-screen flex flex-col` y dejar que el footer cierre.
3. **`.shell`**: contenedor raíz de las páginas principales — `max-width: 2200px`, `margin: 0 auto`, flex column, `min-height: 100dvh`. El footer pega abajo con `margin-top: auto`.
4. **`.cristal`, `.cristal-azul`, `.cristal-azul-min`, `.cristal-azul-max`**: utilidades glassmorphism del proyecto (backdrop blur 5px + sombra, con mezclas de `--bg2` al 0/20/60/70%). Úsalas donde el diseño pida cristal; en Tailwind equivale a `backdrop-blur-*` + fondo translúcido.

## Reglas técnicas

- **Bootstrap**: retirado (2026-11-12). Los componentes nuevos usan **Tailwind** (grid/flex/gap) o CSS Modules.
- **CSS Modules**: cada componente tiene su `X.module.css`; el HTML de Stitch se pega como JSX y sus clases Tailwind se resuelven con el tema ya conectado.
- **Sin estilos globales de elementos**: no existen reglas globales para `h1`, `button` ni `input[type=number]` — cada componente lleva su propia tipografía y estados. Preflight de Tailwind está activo.
- **Iconos**: usar `material-symbols-outlined` con el nombre del icono; en React: `<span className="material-symbols-outlined text-[18px]">icono</span>`.
- **Botones**: nunca asumir estilo heredado; definir bg/color/padding en la propia clase.
