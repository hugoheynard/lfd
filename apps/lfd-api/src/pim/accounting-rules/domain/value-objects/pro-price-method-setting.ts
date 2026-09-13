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
 * ## Pourquoi une seule méthode, et pourtant un mécanisme
 *
 * Une seconde méthode a existé le temps d'une journée : elle devait reproduire
 * le catalogue professionnel imprimé. L'analyse des 89 prix de cette plaquette
 * (2026-09-13) a montré qu'elle **n'applique aucune formule** — ses prix ont
 * été posés à la main, article par article, et la meilleure règle unique ne
 * colle qu'à 21 % des lignes. Une méthode qui ne reproduit rien a été retirée.
 *
 * Ce qui reste est la **place**. Si le commerce fournit un jour une vraie
 * formule, elle s'ajoute à {@link PRO_PRICE_METHODS} et à `proPriceOf`, et tout
 * le reste — colonne, contrainte, route, écran — est déjà là. Une union à un
 * seul membre n'est pas de la généralité spéculative : c'est le prix, très bas,
 * de ne pas refaire cinq pièces pour ajouter un mot.
 */
export class ProPriceMethodSetting {
  private constructor(readonly method: ProPriceMethod) {}

  /** Le comportement d'avant la colonne — ce qu'un réglage muet doit valoir. */
  static ratioTtc(): ProPriceMethodSetting {
    return new ProPriceMethodSetting("ratio_ttc");
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
