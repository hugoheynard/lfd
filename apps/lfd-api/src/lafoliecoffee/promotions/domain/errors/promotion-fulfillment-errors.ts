import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Les refus de l'acheminement d'une promotion** (`documentation/promotions/promotions.md`, § 2.14). Lus
 * par du personnel qui n'a pas le code sous les yeux : chaque message nomme
 * le cas et le geste de sortie.
 */

/** Une promotion « en remise au panier » qui ne coche ni le retrait ni la livraison. */
export class PromotionReachesNothingError extends DomainError {
  constructor() {
    super(
      "promotions.fulfillment_reaches_nothing",
      "Une remise au panier s'applique au retrait, en livraison, ou aux deux : cochez au moins l'un des deux, ou choisissez « Dans le prix affiché ».",
    );
  }
}

/** Le côté d'un acheminement, tel que les refus le nomment. */
export type FulfillmentSide = "pickup" | "delivery";

const SIDE_LIST: Readonly<Record<FulfillmentSide, string>> = {
  pickup: "points de retrait",
  delivery: "zones de livraison",
};

const SIDE_ALL: Readonly<Record<FulfillmentSide, string>> = {
  pickup: "« Tous les points »",
  delivery: "« Toutes les zones »",
};

/** Une sélection de points ou de zones laissée vide. */
export class PromotionEmptyFulfillmentListError extends DomainError {
  constructor(readonly side: FulfillmentSide) {
    super(
      "promotions.fulfillment_list_empty",
      `La sélection de ${SIDE_LIST[side]} est vide : choisissez-en au moins un, prenez ${SIDE_ALL[side]}, ou décochez ce mode.`,
    );
  }
}

/** Un même point ou une même zone nommé deux fois. */
export class PromotionDuplicateFulfillmentTargetError extends DomainError {
  constructor(
    readonly side: FulfillmentSide,
    readonly targetId: string,
  ) {
    super(
      "promotions.fulfillment_target_duplicate",
      `La sélection de ${SIDE_LIST[side]} nomme deux fois ${targetId} : retirez le doublon.`,
    );
  }
}

/** Un identifiant de point ou de zone vide. */
export class PromotionBlankFulfillmentTargetError extends DomainError {
  constructor(readonly side: FulfillmentSide) {
    super(
      "promotions.fulfillment_target_blank",
      `Un des ${SIDE_LIST[side]} choisis n'a pas d'identifiant : rechoisissez-le dans la liste.`,
    );
  }
}

/**
 * Un point ou une zone que la plateforme ne connaît pas (`promotions.md`, § 2.14) — refusé
 * avant la base, jamais une violation de clé étrangère.
 */
export class PromotionUnknownFulfillmentTargetError extends DomainError {
  constructor(
    readonly side: FulfillmentSide,
    readonly targetIds: readonly string[],
  ) {
    super(
      "promotions.fulfillment_target_unknown",
      side === "pickup"
        ? `Point de retrait inconnu (${targetIds.join(", ")}) : il n'existe pas ou plus. Rechargez la page et rechoisissez les points.`
        : `Zone de livraison inconnue (${targetIds.join(", ")}) : elle a été supprimée. Rechargez la page et rechoisissez les zones.`,
    );
  }
}
