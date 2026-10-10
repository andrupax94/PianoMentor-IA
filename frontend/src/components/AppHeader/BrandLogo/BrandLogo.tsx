// description: Logo de marca (barras de piano + nombre).
// context: B-006.4; armazón estático.

import styles from "./BrandLogo.module.css";
import type { BrandLogoProps } from "./BrandLogo.types";

export function BrandLogo({ brandName = "PianoMentor AI" }: BrandLogoProps) {
  return (
    <div className={styles.brand} aria-label={brandName}>
      <span className={styles.bars} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <strong>{brandName}</strong>
    </div>
  );
}
