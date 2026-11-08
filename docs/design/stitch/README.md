# Stitch – base de diseño para PianoMentor AI

Proyecto Stitch inicializado para servir de referencia visual en futuras
modificaciones de diseño del frontend.

## Identificadores

- **Proyecto:** `projects/91769299213639956`
- **Título:** PianoMentor AI
- **Tipo:** `PROJECT_DESIGN`
- **Visibilidad:** `PRIVATE`
- **Origen:** `MCP`
- **Pantalla principal de práctica:**
  - ID: `projects/91769299213639956/screens/c961f6bb08f24f13add2b2d24ff7f9c9`
  - Título: `PianoMentor IA - Pantalla Principal de Práctica`
  - Dispositivo: `DESKTOP`
  - Estado: `COMPLETE`
- **Sistema de diseño (asset):** `assets/2c36ad487dd44595822cd802495cb741`
  - Nombre: `Acoustic Intelligence`
  - Color primario: `#7c3aed` (violeta)
  - Fuentes: Epilogue (titulares), Plus Jakarta Sans (cuerpo), JetBrains Mono (métricas)
  - **Aviso:** este sistema NO coincide con la identidad real del proyecto
    (oscuro, navy+oro, Gabriola+Manrope). Ver sección "Advertencia de identidad".

## Archivos generados en Stitch

- HTML de la pantalla: `projects/91769299213639956/files/8052121c59844d949efb56decfcc3c6c`
- Captura de la pantalla: `projects/91769299213639956/files/3ba0fd506377454da6ad8eb7fdb27b42`

Se pueden descargar con `tools.stitch.download_file` cuando se necesiten.

## Pantallas generadas

- `projects/91769299213639956/screens/c961f6bb08f24f13add2b2d24ff7f9c9` — Pantalla principal de práctica (desktop).
- `projects/91769299213639956/screens/c8ef714e8b58439797767f7d053646e6` — Biblioteca de canciones (desktop).
- `projects/91769299213639956/screens/143b63ba4d2d49b8aca091f0eaa63495` — Iniciar sesión (desktop).
- `projects/91769299213639956/screens/47c910d94f3b490489c98dd1c8cb0dc3` — Recuperación de contraseña (desktop).

Todas reutilizan el sistema de diseño `assets/2c36ad487dd44595822cd802495cb741`.

## Advertencia de identidad (importante)

El sistema de diseño que Stitch asignó automáticamente a este proyecto
(`assets/2c36ad487dd44595822cd802495cb741`, "Acoustic Intelligence") **NO
coincide** con la identidad real de PianoMentor AI definida en `DESIGN.md` y
`globals.css`:

| Aspecto | Stitch ("Acoustic Intelligence") | PianoMentor AI (real) |
|---|---|---|
| Modo | Claro (`LIGHT`) | Oscuro (`dark`) |
| Color primario | Violeta `#630ed4` / `#7c3aed` | Azul acero `#83a9d2` (+ oro `#f5a623`) |
| Tipografía display | Epilogue | Gabriola |
| Tipografía cuerpo | Plus Jakarta Sans | Manrope |
| Tipografía métricas | JetBrains Mono | Manrope |
| Estilo | Material Design 3 (FIDELITY) | Navy profundo + glassmorphism |

Motivo: Stitch generó el sistema de diseño a partir de una descripción genérica
y su catálogo de fuentes no incluye Gabriola (fuente de sistema Windows), por lo
que no puede reproducir fielmente la identidad del proyecto.

**Consecuencia:** las 4 pantallas generadas son **referencias exploratorias**, no
maquetas fieles. Su HTML/capturas sirven para discutir composición y flujos,
pero **no** deben copiarse tal cual ni usarse como fuente de verdad visual.
Toda implementación debe adaptarse a los tokens de `globals.css`, la regla de
Bootstrap solo para grid (skill `piano-mentor-css`) y el `DESIGN.md`
("The Midnight Recital"). No introducir el tema claro, el violeta ni las fuentes
de Stitch en el frontend.

## Uso previsto

1. Antes de modificar el diseño del frontend, consultar este proyecto Stitch y la
   pantalla de referencia.
2. El HTML/captura generados son **referencia visual**: adaptarlos a los
   componentes React, tokens de `globals.css`, CSS Modules y la regla de
   Bootstrap solo para grid (skill `piano-mentor-css`).
3. No copiar el HTML de Stitch tal cual ni introducir frameworks CSS nuevos.
4. Mantener el trío `.tsx` / `.module.css` / `.types.ts` y la arquitectura
   documentada en `ARCHITECTURE.md`.

## Notas

- Stitch no ingiere URLs ni imágenes directamente desde esta integración; la
  pantalla se generó a partir de una descripción detallada del sitio en
  producción (`https://pianomentoria.com`) y del snapshot accesible del mismo.
- Si se desea mayor fidelidad pixel-perfect, tomar capturas manuales de la
  producción y regenerar variantes con `tools.stitch.generate_variants` o
  `tools.stitch.edit_screens`.
