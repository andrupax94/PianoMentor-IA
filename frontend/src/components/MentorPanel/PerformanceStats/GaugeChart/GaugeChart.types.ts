// description: Props del medidor circular reutilizable.
// context: B-006.4; SVG puro, sin dependencias. B-032.10 añade color: el proveedor elige el token para no robarle tono a la página (los dos medidores de Rendimiento usan los colores de la cascada).

export interface GaugeChartProps {
  /** Porcentaje de 0 a 100. */
  value?: number;
  /** Etiqueta bajo el medidor. */
  label?: string;
  /** CSS color del arco de valor; por defecto el acento de página. */
  color?: string;
}
