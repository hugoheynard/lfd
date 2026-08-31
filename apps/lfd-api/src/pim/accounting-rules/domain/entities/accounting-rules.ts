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
}

export class AccountingRules {
  private constructor(private ratioValue: ProPriceRatio) {}

  /** Le premier réglage — celui qui fait exister la ligne. */
  static open(proPriceRatioBp: number): AccountingRules {
    return new AccountingRules(ProPriceRatio.create(proPriceRatioBp));
  }

  /**
   * Reconstitue depuis la base. Le rapport **repasse par son VO** : une ligne
   * écrite avant que la borne existe se signale ici plutôt que de ressortir
   * telle quelle et de tarifer le catalogue entier.
   */
  static reconstitute(snapshot: AccountingRulesSnapshot): AccountingRules {
    return new AccountingRules(ProPriceRatio.create(snapshot.proPriceRatioBp));
  }

  get proPriceRatio(): ProPriceRatio {
    return this.ratioValue;
  }

  setProPriceRatio(basisPoints: number): void {
    this.ratioValue = ProPriceRatio.create(basisPoints);
  }

  snapshot(): AccountingRulesSnapshot {
    return { proPriceRatioBp: this.ratioValue.basisPoints };
  }
}
