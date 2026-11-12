---
name: piano-mentor-css
description: Cualquier operación CSS en PianoMentor AI: Tailwind v4 (tema de Stitch conectado) y CSS Modules, tokens del diseño, estilos inline, orden de importaciones, verificación del CSS compilado y sincronización con la arquitectura. Usar al escribir o modificar estilos, clases o classNames.
---
<!-- description: Skill de CSS: Tailwind v4 + CSS Modules, tokens, orden y verificación. -->
<!-- context: Cargar antes de tocar cualquier fichero .css o un className. -->

# PianoMentor CSS

## Cambio de stack (2026-11-12): de Bootstrap a Tailwind

Historia del cambio, para que nadie vuelva a luchar contra esto:

- **Antes**: Bootstrap 5.3 importado **solo como grid** (`bootstrap-grid.css` +
  extensión propia `grid-fractions.css`), con CSS Modules para el resto. Los
  diseños que Stitch genera (HTML con Tailwind o con Bootstrap completo) no se
  podían pegar: sus clases de componente (`.btn`, `.card`, `.bg-*`, `.text-*`)
  no existían en el grid y quedaban sin estilo.
- **Por qué se retiró**: además de bloquear los diseños de Stitch, el orden de
  capas causaba conflictos reales — las reglas del proyecto sin capa (`h1`,
  `button`, `input[type=number]`, `.grid` en `globals.css`) ganaban a las
  utilidades de Tailwind (`@layer utilities`), y el preflight de Tailwind
  activó bordes latentes (el `border-bottom-width: 3px` del nav). Dos sistemas
  de diseño compitiendo en el mismo CSS.
- **Ahora**: Tailwind **v4** con `@tailwindcss/postcss`, `@import "tailwindcss"`
  y `@config "../../tailwind.config.js"` al principio de `globals.css`. El
  `tailwind.config.js` lleva la **paleta completa de Stitch** (colores,
  escala tipográfica `headline/body/label`, espaciado, radios), así que el HTML
  que Stitch exporta se pega tal cual y resuelve. El layout que quedaba de
  Bootstrap (el footer) se migró a Tailwind, se desinstaló la dependencia y se
  borraron `bootstrap-grid.css` y `grid-fractions.css`.
- **Limpieza asociada**: se eliminaron de `globals.css` las reglas globales de
  `h1`, `button` e `input[type="number"]` (pisaban cualquier componente de
  Stitch) y `.grid` pasó a llamarse `.card-grid` (colisión de nombre con la
  utilidad Tailwind `grid`). El acento dorado del input de BPM vive ahora en
  `TempoMeasure.module.css`, scoped al componente.

## Objetivo

Que cualquier cambio de estilo siga la misma forma que ya tiene la web:
**Tailwind para layout/utilidades rápidas y CSS Modules para estilos de
componente**, con tokens compartidos y sin frameworks CSS adicionales.

## Herramientas de diseño UI

Cuando haya que crear o rediseñar una pantalla, usar **Stitch MCP**
(`tools.stitch.*`) para generar el diseño y la skill **`impeccable`** para
revisar y pulir el resultado. Contexto del proyecto ya subido a Stitch como
DESIGN.md (`docs/design/stitch/PROJECT-CONTEXT.md`): identidad navy+oro,
tokens de `globals.css`, contratos `.shell`/`.cristal`, header y footer siempre
visibles, Tailwind-first. El HTML de Stitch se pega como JSX con sus clases
Tailwind; solo se adapta lo dinámico (estado, eventos, fetch). No introducir
frameworks CSS nuevos.

**Aviso de identidad Stitch:** el proyecto Stitch antiguo
(`projects/91769299213639956`) usa el sistema auto-generado "Acoustic
Intelligence" (tema claro, violeta, Epilogue/Plus Jakarta Sans), que **no
coincide** con la identidad real (oscuro, navy+oro, Manrope). Sus pantallas son
referencia **exploratoria**. El proyecto activo para diseñar es
`projects/3261337811183860602` ("PianoMentor Docs"), que ya parte del tema
correcto y tiene el contexto subido.

## Cómo se estila aquí

- **Tailwind v4 para layout y utilidades**: flex/grid/gap, espaciado, colores
  del tema (`bg-surface-container`, `text-primary`, `text-on-surface-variant`…),
  radios, tipografía de la escala Stitch (`text-headline-*`, `text-body-*`,
  `text-label-*`). El tema vive en `frontend/tailwind.config.js`.
- **CSS Modules por componente**: cada componente tiene su `X.module.css` al
  lado y se usa como `className={styles.x}`. Lo compartido va a `globals.css`.
  Los estilos de estado/animación complejos (transiciones, glassmorphism
  propio, estilos por breakpoint no triviales) siguen yendo al módulo.
- **Cabecera obligatoria** en cada `.css` y en cada `.tsx`:
  `/* description: … */` y `/* context: … */` (en TSX con `//`). Su texto vive
  en `docs/architecture/files.csv`: es la fuente de verdad y el script `--write`
  lo reescribe desde ahí, así que mantén ambos idénticos.
- **Tokens, nunca colores sueltos**: la paleta del proyecto vive en `:root` de
  `globals.css` (`--bg`, `--panel`, `--line`, `--accent`, `--text`, dorados
  `--gold*`, `--gradient1..3`, manos de la cascada `--hand-*`…). La paleta de
  Stitch vive en `tailwind.config.js`. Un color nuevo se añade primero como
  token en el sitio que le corresponda (proyecto → `globals.css`; tema
  Stitch → config).
- **Estilo inline solo para valores dinámicos**: `style={{ … }}` únicamente
  cuando el valor depende de props o estado (altura de footer expandible,
  opacidad por estado). Lo estático va al módulo o a clases Tailwind.
- **Consultas de pantalla**: Tailwind (`md:`, `lg:`…) para componentes nuevos;
  los módulos legacy usan `max-width`: 1000 px (LibraryPage), 900 px
  (AgentDock) y 480 px (AppFooter), más `prefers-reduced-motion: reduce`.
- **Comprueba que la clase existe**: `styles.x` sin regla en el módulo
  **compila y no aplica nada**.

## Cuidados con Tailwind (los fallos reales que ya ocurrieron)

- **Precedencia por capas**: las utilidades de Tailwind viven en
  `@layer utilities`. **Cualquier regla sin capa** (CSS Modules incluidos,
  que van sin capa) gana a una utilidad sobre el mismo elemento. Si un estilo
  de módulo no aplica una utilidad, es esto.
- **Preflight activo**: Tailwind resetea bordes (`border-style: solid`,
  `border-width: 0`), tipografías de headings y márgenes. Reglas como
  `border-bottom-width: 3px` sin estilo explícito ahora **se pintan** (caso
  real: borde blanco bajo los nav-items). Define el borde completo o no lo
  declares.
- **Sin estilos globales de elementos**: no re-añadir reglas globales de
  `h1`, `button`, `input` a `globals.css`; cada componente lleva su
  tipografía y estados (módulo o clases).
- **Contenido escaneado**: las clases de HTML generado en runtime (p. ej. el
  conversor de Markdown de la documentación) se generan porque sus literales
  viven en `src/lib/markdown.ts`, fichero escaneado por el `content` de la
  config. Si metes clases dinámicas por concatenación, verifícalas en el build.
- **Fuentes**: `sans` usa `var(--font-manrope)` (next/font); iconos
  **Material Symbols Outlined** y **JetBrains Mono** llegan por Google Fonts
  en el layout raíz. En React: `<span className="material-symbols-outlined
  text-[18px]">icono</span>`.

## Orden de importaciones

```tsx
// src/app/layout.tsx
import "./globals.css"; // contiene al principio: @import "tailwindcss"; + @config
```

Los módulos de componente se importan en su componente. No hay CSS de
terceros en el layout salvo los `<link>` de Google Fonts (Material Symbols +
JetBrains Mono), que React 19 iza al `<head>`.

## Verificación

```powershell
cd frontend
npx tsc --noEmit          # tipos
npm test                  # vitest: todo en verde
npm run build             # compila y concatena el CSS
```

Comprobar que el tema de Tailwind entró y que no queda Bootstrap (los
patrones con `\{` son para CSS minificado de producción):

```powershell
$all = (Get-ChildItem .next/static/chunks/*.css | Get-Content -Raw) -join "`n"
@(
    @{ p = '--tw-';                    si = $true  },  # utilidades Tailwind
    @{ p = '--color-surface-container'; si = $true },  # tema de Stitch en el CSS
    @{ p = '\.bg-surface-container\{';  si = $true },  # clases del tema resuelven
    @{ p = '--bs-gutter-x';            si = $false },  # grid Bootstrap (retirado)
    @{ p = '\.col-1-5\{';              si = $false },  # fracciones (retiradas)
    @{ p = 'font-family:system-ui';    si = $false }   # reboot (nunca existió aquí)
) | ForEach-Object {
    $hay = [regex]::IsMatch($all, $_.p)
    "{0,-32} {1,-9} {2}" -f $_.p, $(if ($hay) { 'PRESENTE' } else { 'ausente' }),
        $(if ($hay -eq $_.si) { 'OK' } else { 'FALLA' })
}
```

## Sincronía con la arquitectura

1. Añade o actualiza la fila en `docs/architecture/files.csv` (nuevos
   `.css`/`.tsx` y cambios de `layout.tsx`/`package.json`).
2. `python docs/architecture/generate_architecture.py` para regenerar
   `ARCHITECTURE.md`.
3. `python docs/architecture/generate_architecture.py --write --dry-run` → tu
   fila debe dar `[igual]` (si da `escribiría`, tu cabecera no coincide con el
   CSV).

## Checklist

- [ ] ¿Layout? → Tailwind (flex/grid/gap/breakpoints) o CSS Module si es complejo.
- [ ] ¿Colores/tipografía? → tema Tailwind (Stitch) o tokens de `globals.css`; nunca hex suelto.
- [ ] ¿`styles.x` existe realmente en el `.module.css`?
- [ ] ¿Reglas sin capa que puedan pisar utilidades Tailwind sobre el mismo elemento?
- [ ] ¿Bordes completos (width+style+color), no solo width?
- [ ] Cabecera `description`/`context` igual en el fichero y en `files.csv`.
- [ ] `tsc`, `npm test` y `next build` en verde; CSS compilado revisado.
- [ ] Si la pantalla viene de Stitch: header y footer visibles, iconos Material
      Symbols, y nada de frameworks CSS nuevos.
