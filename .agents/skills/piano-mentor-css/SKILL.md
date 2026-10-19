---
name: piano-mentor-css
description: Cualquier operación CSS en PianoMentor AI: regla de uso de Bootstrap (solo los sistemas de agrupación, alineamiento, display, flex y grid, y solo en código nuevo), convenciones de CSS Modules y globals.css, tokens del diseño, estilos inline, orden de importaciones, verificación del CSS compilado y sincronización con la arquitectura. Usar al escribir o modificar estilos, clases o classNames.
---
<!-- description: Skill de CSS: regla de Bootstrap, módulos, tokens, orden y verificación. -->
<!-- context: Cargar antes de tocar cualquier fichero .css o un className. -->

# PianoMentor CSS

## Objetivo

Que cualquier cambio de estilo siga la misma forma que ya tiene la web (módulos
por componente, tokens compartidos) y que Bootstrap se quede exactamente donde el
proyecto lo pidió: **solo su sistema de grids**.

## Regla 1 — Bootstrap: solo layout, y solo en código nuevo

Esta es la regla con la que nace esta skill y manda sobre todo lo demás:

> **Bootstrap solo se usa para los sistemas de agrupación, alineamiento, display,
> flex y grid. Y solo en lo que se genere de ahora en adelante: los estilos ya
> escritos no se reconvierten a Bootstrap.**

Cómo está montado para que se pueda cumplir:

- `bootstrap@5.3.8` en `frontend/package.json`, **pero solo se importa un fichero**:
  `bootstrap/dist/css/bootstrap-grid.css` en `src/app/layout.tsx`, **antes** de
  `./globals.css`. El orden de importación manda (docs de Next): así lo propio
  gana en cualquier empate.
- No están importados `bootstrap.css` (reboot + componentes) ni
  `bootstrap-utilities.css`. **Si escribes una clase que no está en el grid, no
  se aplica y no hay error**: es el fallo silencioso más fácil de cometer aquí.
- No se usa el JS de Bootstrap (ni se instaló).

Qué hay dentro de `bootstrap-grid.css` (medido: 1 194 clases, 68,7 kB fuente,
50,7 kB compilado) — **sistemas permitidos**:

| Sistema | Clases disponibles |
|---|---|
| Agrupación | `.container`, `.container-fluid`, `.container-{sm,md,lg,xl,xxl}`, `.row` |
| Display | `.d-none`, `.d-block`, `.d-flex`, `.d-grid`, `.d-inline-*`, `.d-{breakpoint}-*`, `.d-print-*` |
| Alineamiento | `.justify-content-*`, `.align-items-*`, `.align-self-*` |
| Flex | `.flex-row`, `.flex-column`, `.flex-wrap`, `.flex-nowrap`, `.flex-fill`, `.flex-grow-*`, `.flex-shrink-*`, `.order-*` |
| Grid | `.col`, `.col-{n}`, `.col-{breakpoint}-{n}`, `.offset-*`, `.row-cols-*`, canales `.g-*`, `.gx-*`, `.gy-*`, `.d-grid` |

**Fuera de regla (no existen en el fichero importado):**

- Componentes: `.btn`, `.card`, `.nav`, `.modal`, `.alert`, `.dropdown`…
- Reboot/tipografía: `h1`-`h6`, `p`, `a`, `body` de Bootstrap.
- Colores y textos: `.bg-*`, `.text-*`, `.border*`, `.shadow`.
- Spacing propio de Bootstrap: `.m-*`, `.p-*`, `.mt-*`…
- **`.gap-*`**: no está en el grid. Si lo necesitas en flex, escribe `gap: 16px`
  en tu `*.module.css`. **No** importes `bootstrap-utilities.css` para conseguirlo:
  desbloquearía colores, textos y spacing que esta regla excluye.

**No reconvertir lo existente**: los estilos ya escritos (31 ficheros
`*.module.css` en `src/components` más `page.module.css`; 33 `.css` en total)
conservan sus clases propias. `AppFooter` tiene su `.container` y `SongRow` su `.row` **en sus módulos**
(a CSS Modules, con nombres hasheados): no colisionan con los de Bootstrap y no
hay motivo para tocarlos.

## Cómo se estila aquí

- **CSS Modules por componente**: cada componente tiene su `X.module.css` al lado
  y se usa como `className={styles.x}`. Lo compartido va a `globals.css` (el único
  CSS global, más `page.module.css`).
- **Cabecera obligatoria** en cada `.css` y en cada `.tsx`:
  `/* description: … */` y `/* context: … */` (en TSX con `//`). Su texto vive en
  `architecture/files.csv`: es la fuente de verdad y el script `--write` lo reescribe
  desde ahí, así que mantén ambos idénticos.
- **Tokens, nunca colores sueltos**: la paleta vive en `:root` de `globals.css`
  (`--bg`, `--panel`, `--line`, `--accent`, `--text`, `--text-soft`, `--text-mute`,
  dorados `--gold*`, `--blue`, tipografías `--font1`/`--font2`, `--gradient1..3`,
  `--shadow1`). Su comentario de cabecera lo dice: *los componentes solo los consumen*.
  Un color nuevo se añade primero como token.
- **Estilo inline solo para valores dinámicos**: `style={{ … }}` aparece únicamente
  cuando el valor depende de props o estado (ancho de barra `${clamped}%`,
  `maskImage` con el icono de cada pestaña, mostrar/ocultar por estado). Lo estático
  va al módulo.
- **Consultas de pantalla por componente**, en `max-width`: 1000 px (LibraryPage),
  900 px (AgentDock) y 480 px (AppFooter), más `prefers-reduced-motion: reduce`
  para respetar la animación reducida (MentorChat).
- **Comprueba que la clase existe**: `styles.x` sin regla correspondiente en el
  módulo **compila y no aplica nada**. Caso real hoy: `SessionStatus.tsx` usa
  `styles.panel` y `SessionStatus.module.css` está **vacío (0 bytes)**.

## Orden de importaciones

```tsx
import "bootstrap/dist/css/bootstrap-grid.css"; // antes: lo propio gana en empates
import "./globals.css";
```

Ambas en `src/app/layout.tsx`. Los módulos de componente se importan en su
componente. Si mueves el orden, revisa el build: en producción Next concatena el
CSS y **el orden puede cambiar respecto a dev**.

## Verificación

```powershell
cd frontend
npx tsc --noEmit          # tipos
npm test                  # vitest: todo en verde
npm run build             # compila y concatena el CSS
```

Comprobar que el grid entró y que no entró nada prohibido (los patrones con `\{`
son para CSS minificado de producción):

```powershell
$all = (Get-ChildItem .next/static/chunks/*.css | Get-Content -Raw) -join "`n"
@(
    @{ p = '--bs-gutter-x';          si = $true  },   # grid
    @{ p = '\.container\{';          si = $true  },   # agrupación
    @{ p = '\.d-flex\{';             si = $true  },   # display
    @{ p = '\.align-items-center\{'; si = $true  },   # alineamiento
    @{ p = '\.flex-grow-1\{';        si = $true  },   # flex
    @{ p = 'font-family:system-ui';  si = $false },   # reboot (prohibido)
    @{ p = '\.btn\{';                si = $false },   # componentes (prohibido)
    @{ p = '\.bg-primary\{';         si = $false }    # colores (prohibido)
) | ForEach-Object {
    $hay = [regex]::IsMatch($all, $_.p)
    "{0,-30} {1,-9} {2}" -f $_.p, $(if ($hay) { 'PRESENTE' } else { 'ausente' }),
        $(if ($hay -eq $_.si) { 'OK' } else { 'FALLA' })
}
```

Y el orden dentro del chunk: `--bs-gutter-x` (grid) debe aparecer **antes** que
`--bg:` (globals).

```powershell
$f = Get-ChildItem .next/static/chunks/*.css |
    Where-Object { (Get-Content $_.FullName -Raw) -match '--bs-gutter-x' } | Select-Object -First 1
$c = Get-Content $f.FullName -Raw
"grid@{0}  globals@{1}  ->  {2}" -f $c.IndexOf('--bs-gutter-x'), $c.IndexOf('--bg:'),
    $(if ($c.IndexOf('--bs-gutter-x') -lt $c.IndexOf('--bg:')) { 'OK (grid antes)' } else { 'FALLA (globals antes)' })
```

## Sincronía con la arquitectura

1. Añade o actualiza la fila en `architecture/files.csv` (nuevos `.css`/`.tsx`
   y cambios de `layout.tsx`/`package.json`).
2. `python architecture/generate_architecture.py` para regenerar `ARCHITECTURE.md`.
3. `python architecture/generate_architecture.py --write --dry-run` → tu fila debe
   dar `[igual]` (si da `escribiría`, tu cabecera no coincide con el CSV).

## Checklist

- [ ] ¿Es código nuevo? Si es lo ya escrito, no se mete Bootstrap.
- [ ] ¿Es agrupación, alineamiento, display, flex o grid? Si no, no es Bootstrap.
- [ ] La clase existe en `bootstrap-grid.css` (no en `bootstrap.css` ni en utilities).
- [ ] Colores/tipografía/spacing: tokens de `globals.css` o tu módulo, no Bootstrap.
- [ ] `styles.x` existe realmente en el `.module.css`.
- [ ] Cabecera `description`/`context` igual en el fichero y en `files.csv`.
- [ ] `tsc`, `npm test` y `next build` en verde; CSS compilado revisado.
