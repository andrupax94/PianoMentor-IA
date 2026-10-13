// description: Logo de marca (barras de piano + nombre).
// context: B-006.4; armazón estático.

import styles from "./BrandLogo.module.css";
import type { BrandLogoProps } from "./BrandLogo.types";

export function BrandLogo({ brandName = "PianoMentor AI", brandNameP1 = "PianoMentor", brandNameP2 = "AI" }: BrandLogoProps) {
  return (
    <div className={styles.brand} aria-label={brandName}>
      <div className={styles.brandIcon}></div>
      <strong>
        <span>{brandNameP1}</span>
        <span>{brandNameP2}</span>
      </strong>
    </div>
  );
}
