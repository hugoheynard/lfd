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
