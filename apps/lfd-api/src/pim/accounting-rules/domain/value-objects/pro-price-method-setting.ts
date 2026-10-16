import { PRO_PRICE_METHODS, type ProPriceMethod, type ProPricePolicy } from "@lfd/pim-contracts";

import { InvalidProPriceMethodError } from "../errors/accounting-rules-errors.js";
import type { ProPriceRatio } from "./pro-price-ratio.js";

/**
 * **La méthode de calcul du prix professionnel, et ce qu'elle exige.**
 *
 * Un value object pour un seul champ, et c'est assumé : il garde l'endroit où
 * la validation d'une méthode vit. La colonne est une chaîne libre en base —
 * une valeur inconnue y tariferait le catalogue sur un calcul que personne n'a
 * écrit, et c'est ICI qu'elle est refusée, à la reconstitution comme à la
 * saisie.
 *
 * ## Deux méthodes, et laquelle par défaut
 *
 * `entered` (le prix pro HT saisi, seule source) est la méthode d'une base
 * vierge depuis le lot S (`plan-catalogue-synchronise-par-audience.md`,
 * 2026-10-16). `ratio_ttc` reste : une base qui y est encore la garde jusqu'au
 * geste « Passer au prix saisi », et son code n'est pas effacé.
 */
export class ProPriceMethodSetting {
  private constructor(readonly method: ProPriceMethod) {}

  /**
   * Ce qu'un réglage muet vaut depuis le lot S : le prix saisi. Une base
   * vierge n'a aucun prix à préserver.
   */
  static entered(): ProPriceMethodSetting {
    return new ProPriceMethodSetting("entered");
  }

  /**
   * Refuse une méthode inconnue plutôt que de la laisser passer.
   *
   * Le paramètre est une `string` et non l'union : c'est précisément une valeur
   * venue de la base ou du réseau qu'on juge ici, et la typer d'avance ferait
   * croire que quelqu'un l'a déjà vérifiée.
   */
  static create(method: string): ProPriceMethodSetting {
    if (!PRO_PRICE_METHODS.includes(method as ProPriceMethod)) {
      throw new InvalidProPriceMethodError(method);
    }
    return new ProPriceMethodSetting(method as ProPriceMethod);
  }

  /**
   * Le réglage complet, prêt pour `proPriceOf` — méthode, rapport et taux figé.
   *
   * Assemblé ici plutôt que chez chaque appelant : c'est l'agrégat qui sait que
   * ces trois nombres vont ensemble, et trois arguments positionnels dont deux
   * sont des `number` voisins s'intervertissent sans qu'un compilateur bronche.
   */
  policyWith(ratio: ProPriceRatio): ProPricePolicy {
    return { method: this.method, ratioBp: ratio.basisPoints };
  }

  equals(other: ProPriceMethodSetting): boolean {
    return this.method === other.method;
  }
}
