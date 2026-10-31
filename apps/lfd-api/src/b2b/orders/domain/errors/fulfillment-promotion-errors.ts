import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Un changement d'acheminement qui ajouterait, retirerait ou remplacerait
 * une promotion** (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.8, lot L9 ; § 18.5, lot M3 : la promotion en cause est nommée).
 * Refusé plutôt que recalculé en silence : le client a commandé à un prix, et
 * changer de point ne doit pas le changer dans son dos.
 */
export class FulfillmentChangeAltersPromotionError extends BusinessError {
  constructor(
    readonly orderId: string,
    readonly direction: "adds" | "removes" | "replaces",
    /** Le libellé figé de la promotion en cause, en français ; `null` s'il n'y en a pas. */
    readonly promotionLabel: string | null = null,
  ) {
    super("orders.revise.fulfillment_alters_promotion", messageOf(direction, promotionLabel));
  }
}

function messageOf(
  direction: FulfillmentChangeAltersPromotionError["direction"],
  label: string | null,
): string {
  const named = label === null ? "" : ` « ${label} »`;
  const effect =
    direction === "adds"
      ? `ferait bénéficier la commande d'une promotion${named} qu'elle n'avait pas`
      : direction === "removes"
        ? `retirerait la promotion${named} dont la commande bénéficie`
        : `remplacerait la promotion${named} dont la commande bénéficie par une autre`;
  return (
    `Ce changement de mode ou de point de retrait ${effect} : la commande ne se modifie pas ainsi. ` +
    "Gardez le même acheminement, ou annulez la commande et repassez-la avec le nouveau."
  );
}
