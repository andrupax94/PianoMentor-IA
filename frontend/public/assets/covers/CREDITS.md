<!-- description: Procedencia y licencia de los retratos usados como portadas del corpus. -->
<!-- context: Activos preparados para B-027.3 (selector de piezas); todas las imagenes son de dominio publico. -->

# Creditos de las portadas del corpus

Retratos usados como portada de las piezas del corpus. Todas las imagenes son de
**dominio publico** (obras anteriores a 1900, PD-old-100), descargadas de Wikimedia
Commons a ~800 px de ancho. **Sin texto superpuesto**: el titulo y el compositor los
pinta la interfaz, no la imagen.

| Archivo | Retratado | Obra | Autor | Fecha | Licencia | Fuente (Wikimedia Commons) |
|---|---|---|---|---|---|---|
| `bach.jpg` | Johann Sebastian Bach | Retrato con el Canon triplex a 6 Voc. | Elias Gottlob Haussmann | 1748 | Public domain | https://commons.wikimedia.org/wiki/File:Johann_Sebastian_Bach.jpg |
| `beethoven.jpg` | Ludwig van Beethoven | Retrato con el manuscrito de la Missa solemnis | Joseph Karl Stieler | 1820 | Public domain | https://commons.wikimedia.org/wiki/File:Joseph_Karl_Stieler%27s_Beethoven_mit_dem_Manuskript_der_Missa_solemnis.jpg |
| `chopin.jpg` | Frederic Chopin | Daguerrotipo de Chopin | Louis-Auguste Bisson | 1849 | Public domain | https://commons.wikimedia.org/wiki/File:Frederic_Chopin_photo.jpeg |
| `mozart.jpg` | Wolfgang Amadeus Mozart | Retrato de Mozart | Barbara Krafft | 1819 | Public domain | https://commons.wikimedia.org/wiki/File:Barbara_Krafft_-_Portr%C3%A4t_Wolfgang_Amadeus_Mozart_(1819).jpg |

## Asignacion a las piezas

Las 15 piezas del corpus pertenecen a 4 compositores; el retrato se elige por el slug
del compositor (minusculas, sin espacios):

- `bach.jpg` → p01, p02, p03, p04
- `mozart.jpg` → p05, p06, p07
- `beethoven.jpg` → p08, p09, p10, p11
- `chopin.jpg` → p12, p13, p14, p15

## Notas

- Las imagenes conservan su proporcion original; el recorte (por ejemplo a cuadrado)
  queda pendiente del diseno final del selector.
- La composicion musical de las 15 piezas ya esta en dominio publico; la licencia del
  fichero MIDI concreto se documenta en `data/midi/catalog.json`.
