import type { ProPriceMethod, ProPricePolicy } from "@lfd/pim-contracts";

import { InvalidProPriceMethodError } from "../errors/accounting-rules-errors.js";
import type { ProPriceRatio } from "./pro-price-ratio.js";

/**
 * **La méthode de calcul du prix professionnel, et ce qu'elle exige.**
 *
 * Un value object pour DEUX champs parce que l'invariant est **entre** eux :
 * `remise_apres_tva_max` n'a aucun sens sans son taux figé, et `ratio_ttc` n'a
 * rien à faire d'un taux. Les tenir séparés laisserait exister un réglage qui
 * prétend dépouiller une TVA sans savoir laquelle — la moitié d'une décision
 * d'argent, qu'aucune lecture ne pourrait rattraper.
 *
 * ## 🔴 `remise_apres_tva_max` est FAUSSE, et on la garde
 *
 * Elle reproduit un calcul fait en réunion de communication avec 20 % de TVA au
 * lieu du taux réel des articles, et **parti à l'impression** : la plaquette
 * commerciale annonce ces prix-là. Elle existe pour tenir un engagement déjà
 * pris, pas parce qu'elle est juste. Le jour où la plaquette est refaite, c'est
 * la méthode qu'on retire — jamais sa formule qu'on ajuste.
 *
 * ## Pourquoi le taux est FIGÉ et non lu
 *
 * C'est le taux qu'une réunion a employé un jour donné, pas le maximum courant
 * du référentiel. Le relire à chaque calcul ferait retarifer tout le catalogue
 * professionnel le jour où quelqu'un crée, modifie ou **supprime** un taux de
 * TVA — de l'action à distance sur de l'argent, que rien ne signalerait. Le
 * référentiel peut le PROPOSER à la saisie ; il ne le change jamais après coup.
 */
export class ProPriceMethodSetting {
  private constructor(
    readonly method: ProPriceMethod,
    readonly fixedVatPercent: number | null,
  ) {}

  /** Le comportement d'avant la colonne — ce qu'un réglage muet doit valoir. */
  static ratioTtc(): ProPriceMethodSetting {
    return new ProPriceMethodSetting("ratio_ttc", null);
  }

  static create(method: ProPriceMethod, fixedVatPercent: number | null): ProPriceMethodSetting {
    const needsRate = method === "remise_apres_tva_max";
    if (needsRate !== (fixedVatPercent !== null)) {
      throw new InvalidProPriceMethodError(method, fixedVatPercent);
    }
    if (fixedVatPercent !== null && (!Number.isFinite(fixedVatPercent) || fixedVatPercent < 0)) {
      throw new InvalidProPriceMethodError(method, fixedVatPercent);
    }
    return new ProPriceMethodSetting(method, fixedVatPercent);
  }

  /**
   * Le réglage complet, prêt pour `proPriceOf` — méthode, rapport et taux figé.
   *
   * Assemblé ici plutôt que chez chaque appelant : c'est l'agrégat qui sait que
   * ces trois nombres vont ensemble, et trois arguments positionnels dont deux
   * sont des `number` voisins s'intervertissent sans qu'un compilateur bronche.
   */
  policyWith(ratio: ProPriceRatio): ProPricePolicy {
    return {
      method: this.method,
      ratioBp: ratio.basisPoints,
      fixedVatPercent: this.fixedVatPercent,
    };
  }

  equals(other: ProPriceMethodSetting): boolean {
    return this.method === other.method && this.fixedVatPercent === other.fixedVatPercent;
  }
}
