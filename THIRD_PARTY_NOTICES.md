<!-- description: Atribución y licencias de recursos de terceros usados en el proyecto. -->
<!-- context: Requisito de las licencias CC BY; lo referencia el manifiesto de muestras y el README. -->

# Avisos de terceros

Este documento recoge los recursos de terceros que viajan con el proyecto (muestras, corpus, assets gráficos) y las condiciones que hay que cumplir para usarlos. Cada fila nueva debe indicar autor, licencia, origen y qué se ha derivado.

## Salamander Grand Piano (muestras de audio del frontend)

| Campo | Valor |
|---|---|
| Recurso | Muestras de piano de `frontend/public/audio/piano/` (120 MP3 + `manifest.json`) |
| Autor | Alexander Holm |
| Licencia | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) (Creative Commons Atribución 3.0) |
| Origen | [Salamander Grand Piano V3](https://archive.org/details/SalamanderGrandPianoV3) (Internet Archive); banco original descrito en [SFZ Instruments](https://sfzinstruments.github.io/pianos/salamander/) |
| Banco original | `SalamanderGrandPianoV3_OggVorbis.tar.bz2`, SHA‑1 `5B0247D375FF55AEA8A58F775B448E4C4C0E642A` |
| Instrumento grabado | Yamaha C5, captado con dos AKG C414 en AB a ~12 cm de las cuerdas |
| Derivación | Selección de dos capas de las 16 grabadas (v4 suave y v13 fuerte) en las 30 teclas muestreadas en terceras menores (A0–C8), recorte de cola variable según registro y trascodificación a MP3 mono con `ffmpeg` (128 kbit/s para el rango visible, 64 kbit/s para el resto) |
| Regeneración | `npm run samples` en `frontend/` (`scripts/fetch-piano-samples.mjs`) |
| Piano Image |Foto de <a href="https://unsplash.com/es/@noemierssl?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Noémie Roussel</a> en <a href="https://unsplash.com/es/fotos/piano-vertical-en-blanco-y-negro-29_GYAQqHx0?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Unsplash</a> |

La licencia CC BY 3.0 permite usar, remezclar y redistribuir el material, incluso con fines comerciales, **siempre que se cite al autor**. Esta atribución, el enlace a la licencia y la nota de derivación cumplen ese requisito; si los ficheros se mueven a un almacén externo (por ejemplo Cloudflare R2), la atribución debe viajar con ellos, por ejemplo en la propia carpeta y en la interfaz.
