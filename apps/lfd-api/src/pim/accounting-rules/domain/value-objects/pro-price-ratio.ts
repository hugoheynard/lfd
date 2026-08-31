import { MAX_RATIO_BP } from "@lfd/pim-contracts";

import { InvalidProPriceRatioError } from "../errors/accounting-rules-errors.js";

const BP_PER_UNIT = MAX_RATIO_BP;

/**
 * **Le rapport prix pro TTC / prix public TTC.**
 *
 * En points de base entiers — 9 000 = 90 %, soit « le professionnel paie 10 %
 * de moins ». Le rapport, jamais la remise : c'est ce qui MULTIPLIE, et dériver
 * une multiplication d'une soustraction ajoute un endroit où se tromper de
 * sens.
 *
 * ## Pourquoi pas `exact-money`
 *
 * La plateforme a déjà une arithmétique rationnelle exacte
 * (`b2b/pricing/domain/exact-money.ts`), et elle serait parfaite ici. Le
 * référentiel ne peut pas la voir : la matrice des frontières lui interdit
 * `b2b/`, pour la même raison qui lui interdit d'appeler le journal
 * directement. Elle n'est pas nécessaire non plus — un rapport en points de
 * base appliqué à des centimes tient dans l'entier : `10⁷ × 10⁴ = 10¹¹`, très
 * en deçà de `Number.MAX_SAFE_INTEGER`. Aucune division intermédiaire, donc
 * aucune dérive à rattraper.
 *
 * Le jour où la conversion TTC → HT arrivera (tranche 3), elle divisera, et
 * c'est LÀ qu'il faudra rouvrir la question — pas ici.
 */
export class ProPriceRatio {
  private constructor(readonly basisPoints: number) {}

  static create(basisPoints: number): ProPriceRatio {
    if (!Number.isInteger(basisPoints) || basisPoints <= 0 || basisPoints > MAX_RATIO_BP) {
      throw new InvalidProPriceRatioError(basisPoints);
    }
    return new ProPriceRatio(basisPoints);
  }

  /**
   * Le prix professionnel TTC, dérivé d'un prix public TTC — tous deux en
   * centimes entiers.
   *
   * **Un seul arrondi, au dernier moment**, comme la chaîne de résolution de
   * prix : on multiplie d'abord, on divise ensuite. `Math.round(ttc * bp /
   * 10000)` et non `Math.round(ttc * (bp / 10000))` — la seconde forme arrondit
   * le rapport avant de l'appliquer, et perd un centime sur les prix ronds.
   *
   * `Math.round` et non `Math.floor` : arrondir systématiquement vers le bas
   * offrirait un demi-centime au client sur chaque ligne, ce qui n'est pas une
   * remise que quelqu'un a décidée.
   */
  applyTo(publicTtcCents: number): number {
    return Math.round((publicTtcCents * this.basisPoints) / BP_PER_UNIT);
  }

  equals(other: ProPriceRatio): boolean {
    return this.basisPoints === other.basisPoints;
  }
}
