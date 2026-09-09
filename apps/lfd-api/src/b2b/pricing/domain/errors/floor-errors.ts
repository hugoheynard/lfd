/**
 * **Les refus d'un PLANCHER.**
 *
 * Un plancher relève un prix. Se tromper ici coûte donc dans le sens le plus
 * difficile à voir : un prix trop HAUT ne fait pas d'erreur, il fait perdre une
 * vente.
 */

import {
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Deux planchers de **même portée** visent le même article.
 *
 * Même nature de faute que pour les règles, et même double barrière : un index
 * unique en base, cette vérification dans le domaine. La différence est qu'ici
 * le résultat serait *plus* insidieux — un plancher tiré au hasard entre deux ne
 * se voit que le jour où le mauvais laisse passer un prix trop bas.
 */
export class AmbiguousPriceFloorsError extends DomainError {
  constructor(
    readonly firstFloorId: string,
    readonly secondFloorId: string,
  ) {
    super(
      "pricing.floors.ambiguous",
      `Deux planchers de même portée s'appliquent (${firstFloorId}, ${secondFloorId}) : la limite ne peut pas être déterminée.`,
    );
  }
}

/**
 * Une ligne de `price_floors` que le domaine ne sait pas lire.
 *
 * Même raisonnement que pour une règle illisible, en plus tranché : ignorer un
 * plancher retirerait la protection exactement là où quelqu'un avait jugé
 * qu'elle était nécessaire — et sans que rien ne le dise.
 */
export class CorruptedPriceFloorError extends TechnicalError {
  constructor(
    readonly floorId: string,
    readonly reason: string,
  ) {
    super("pricing.floor.corrupted", `Plancher « ${floorId} » illisible : ${reason}.`);
  }
}

/**
 * Un plancher fixé **au-dessus** du prix canonique.
 *
 * Il ne planchérait rien : il relèverait tous les prix, y compris ceux
 * qu'aucune règle n'a touchés. Ce serait une hausse tarifaire déguisée en
 * garde-fou, saisie dans l'écran qui protège des hausses — et personne ne
 * penserait à la chercher là.
 */
export class FloorAboveCanonicalError extends DomainError {
  constructor(readonly bp: number) {
    super(
      "pricing.floor.above_canonical",
      `Un plancher à ${String(bp / 100)} % du prix canonique le dépasse : il relèverait les prix au lieu de les protéger.`,
    );
  }
}

/** Aucun plancher n'était posé sur cette portée. Même raisonnement. */
export class PriceFloorNotFoundError extends ResourceNotFoundError {
  constructor(
    readonly scopeType: string,
    readonly scopeId: string | null,
  ) {
    super(
      "pricing.floor.not_found",
      `Aucune limite posée sur cette portée (${scopeType}${scopeId === null ? "" : ` : ${scopeId}`}).`,
    );
  }
}

/**
 * Un plancher dynamique **sans condition d'ouverture**.
 *
 * Ce serait un mur plus bas : le plancher dur ne servirait plus à rien, et
 * personne ne verrait qu'il a été contourné — puisque l'écran continuerait de
 * l'afficher.
 */
export class UnlockableDynamicFloorError extends DomainError {
  constructor() {
    super(
      "pricing.floor.dynamic_without_key",
      "Un plancher dynamique doit être déverrouillé par une quantité, un volume, ou les deux : sans condition, il remplacerait purement et simplement le plancher dur.",
    );
  }
}

/**
 * Un plancher dynamique **au-dessus** du plancher dur.
 *
 * Il ne s'ouvrirait sur rien : le mur mordrait d'abord, et l'écran afficherait
 * une condition de volume qui ne change jamais le prix. Refusé à la saisie,
 * pendant que c'est encore une faute de frappe.
 *
 * Comparé seulement à unité égale : « 50 % du tarif » et « 1,20 € » ne se
 * comparent pas sans connaître l'article, et cet agrégat peut porter sur toute
 * une famille.
 */
export class DynamicFloorNotBelowHardError extends DomainError {
  constructor() {
    super(
      "pricing.floor.dynamic_not_below_hard",
      "Le plancher dynamique doit être STRICTEMENT sous le plancher dur : au-dessus, il ne s'ouvrirait sur rien.",
    );
  }
}

/**
 * Une limite **en euros** posée sur une portée qui n'est pas une unité.
 *
 * « Jamais sous 1,50 € » ne veut rien dire sur tout le catalogue, ni sur une
 * famille : le même mur laisserait passer une pièce montée à 1,50 € et
 * relèverait un croissant qui se vend 2,00 €. Le montant ne prend son sens qu'une
 * fois qu'on sait DE QUEL article on parle.
 *
 * Une **fraction**, elle, suit l'article : « jamais sous 60 % du tarif » protège
 * la pièce montée et le croissant de la même façon, chacun à son échelle. C'est
 * la seule forme qu'une portée large peut porter honnêtement.
 */
export class AmountFloorOnBroadScopeError extends DomainError {
  constructor(readonly scopeType: string) {
    super(
      "pricing.floor.amount_on_broad_scope",
      "Une limite en euros ne veut rien dire au-delà d'un article : le même montant relèverait les uns et laisserait passer les autres. Sur tout le catalogue ou sur une famille, la limite s'exprime en pourcentage du tarif.",
    );
  }
}
