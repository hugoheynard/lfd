import { MAX_RATIO_BP, proPriceFromPublic } from "@lfd/pim-contracts";

import { InvalidProPriceRatioError } from "../errors/accounting-rules-errors.js";

/**
 * **Le rapport prix pro TTC / prix public TTC.**
 *
 * En points de base entiers — 9 000 = 90 %, soit « le professionnel paie 10 %
 * de moins ». Le rapport, jamais la remise : c'est ce qui MULTIPLIE, et dériver
 * une multiplication d'une soustraction ajoute un endroit où se tromper de
 * sens.
 *
 * ## Pourquoi le calcul n'est pas ici
 *
 * `applyTo` délègue à `proPriceFromPublic`, dans `@lfd/pim-contracts` : l'écran
 * doit montrer ce que le rapport produit, donc faire le même calcul. Une
 * seconde implémentation divergerait d'un centime d'arrondi, et ça ne se voit
 * qu'en comparant deux factures.
 *
 * ## L'arithmétique
 *
 * La multiplication passe par `@lfd/money`, les rationnels exacts en `bigint`.
 * Ils vivaient dans `b2b/pricing/`, que la matrice des frontières interdit au
 * référentiel de voir ; ils sont devenus un paquet plutôt qu'une seconde
 * implémentation — deux arithmétiques d'argent qui divergent seraient le pire
 * des synonymes.
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
   * Le calcul lui-même vit dans le **contrat** (`proPriceFromPublic`), et pas
   * ici : l'écran des règles comptables montre ce que le réglage produit, donc
   * il fait le même calcul. Deux implémentations finiraient par diverger d'un
   * centime d'arrondi, et cette divergence-là ne se voit qu'en comparant deux
   * factures. Le VO garde ce qu'il est seul à savoir — que le rapport est
   * valide.
   */
  applyTo(publicTtcCents: number): number {
    return proPriceFromPublic(publicTtcCents, this.basisPoints);
  }

  equals(other: ProPriceRatio): boolean {
    return this.basisPoints === other.basisPoints;
  }
}
