import type { ProPricePolicy } from "@lfd/pim-contracts";

import { ProPriceMethodSetting } from "../value-objects/pro-price-method-setting.js";
import { ProPriceRatio } from "../value-objects/pro-price-ratio.js";

/**
 * **Les règles comptables — l'agrégat.**
 *
 * Un singleton : il n'y en a qu'un, et son identité est une constante. Il ne
 * porte qu'une règle aujourd'hui — le rapport prix pro / prix public — et c'est
 * assumé : la décision est globale, elle n'a pas de porteur naturel dans le
 * catalogue, et lui donner sa maison maintenant évite qu'elle atterrisse en
 * colonne sur `Category`. Le référentiel a déjà payé deux fois ce
 * raccourci-là (les trois colonnes de TVA, la matrice de canaux en `jsonb`).
 *
 * Ce qu'il garantit : le rapport est **valide** (VO `ProPriceRatio`). Ce qu'il
 * ne peut pas voir, et qui reste à l'appelant : que quelqu'un ait le droit de
 * le poser.
 *
 * **Il n'existe pas tant que rien n'a été réglé.** Pas de `AccountingRules`
 * vide, pas de rapport à 100 % par défaut : l'absence est un état que le
 * dépôt rend par `null` et que l'écran doit savoir dire.
 */
export interface AccountingRulesSnapshot {
  readonly proPriceRatioBp: number;
  readonly proPriceMethod: string;
}

export class AccountingRules {
  private constructor(
    private ratioValue: ProPriceRatio,
    private methodValue: ProPriceMethodSetting,
  ) {}

  /**
   * Le premier réglage — celui qui fait exister la ligne.
   *
   * Il naît sur `ratio_ttc` — la seule méthode disponible, et de toute façon
   * celle qu'un réglage muet doit valoir : un déploiement ne change jamais un
   * prix par lui-même.
   */
  static open(proPriceRatioBp: number): AccountingRules {
    return new AccountingRules(
      ProPriceRatio.create(proPriceRatioBp),
      ProPriceMethodSetting.ratioTtc(),
    );
  }

  /**
   * Reconstitue depuis la base. Le rapport **repasse par son VO** : une ligne
   * écrite avant que la borne existe se signale ici plutôt que de ressortir
   * telle quelle et de tarifer le catalogue entier.
   */
  static reconstitute(snapshot: AccountingRulesSnapshot): AccountingRules {
    return new AccountingRules(
      ProPriceRatio.create(snapshot.proPriceRatioBp),
      ProPriceMethodSetting.create(snapshot.proPriceMethod),
    );
  }

  get proPriceRatio(): ProPriceRatio {
    return this.ratioValue;
  }

  get proPriceMethod(): ProPriceMethodSetting {
    return this.methodValue;
  }

  /**
   * **Le réglage tel qu'il s'applique** — l'unique forme que les calculs lisent.
   *
   * Rendre la politique entière plutôt que ses trois nombres : c'est l'agrégat
   * qui sait qu'ils vont ensemble, et un appelant qui les recompose pourrait
   * marier le rapport d'aujourd'hui à la méthode d'hier.
   */
  get policy(): ProPricePolicy {
    return this.methodValue.policyWith(this.ratioValue);
  }

  setProPriceRatio(basisPoints: number): void {
    this.ratioValue = ProPriceRatio.create(basisPoints);
  }

  /**
   * Choisit la méthode appliquée — c'est elle que le push suivra.
   *
   * Le geste est séparé de celui du rapport, et ce n'est pas de la symétrie :
   * changer de méthode retarife le catalogue professionnel entier, changer le
   * rapport aussi, et les enchaîner dans une seule écriture rendrait impossible
   * de lire dans le journal laquelle des deux décisions a produit quel écart.
   */
  chooseMethod(method: string): void {
    this.methodValue = ProPriceMethodSetting.create(method);
  }

  snapshot(): AccountingRulesSnapshot {
    return {
      proPriceRatioBp: this.ratioValue.basisPoints,
      proPriceMethod: this.methodValue.method,
    };
  }
}
