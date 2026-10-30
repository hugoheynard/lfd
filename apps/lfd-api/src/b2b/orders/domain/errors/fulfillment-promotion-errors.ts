import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Un changement d'acheminement qui ajouterait ou retirerait une promotion**
 * (plan `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.8, lot L9). Refusé plutôt que recalculé en silence : le client a
 * commandé à un prix, et changer de point ne doit pas le changer dans son dos.
 */
export class FulfillmentChangeAltersPromotionError extends BusinessError {
  constructor(
    readonly orderId: string,
    readonly direction: "adds" | "removes" | "replaces",
  ) {
    super("orders.revise.fulfillment_alters_promotion", messageOf(direction));
  }
}

function messageOf(direction: FulfillmentChangeAltersPromotionError["direction"]): string {
  const effect =
    direction === "adds"
      ? "ferait bénéficier la commande d'une promotion qu'elle n'avait pas"
      : direction === "removes"
        ? "retirerait la promotion dont la commande bénéficie"
        : "remplacerait la promotion dont la commande bénéficie par une autre";
  return (
    `Ce changement de mode ou de point de retrait ${effect} : la commande ne se modifie pas ainsi. ` +
    "Gardez le même acheminement, ou annulez la commande et repassez-la avec le nouveau."
  );
}
