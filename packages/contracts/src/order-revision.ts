import { z } from "zod";

import type { DiscountLabelView } from "./discount-label.js";
import type { OrderRevisionChange } from "./order-revision.values.js";
import {
  deliveryAddressIssue,
  hasAddressWhenDelivered,
  hasPickupPointWhenPickedUp,
  orderContentShape,
  type OrderSaleUnit,
  pickupPointIssue,
} from "./order.js";

/**
 * **Modifier une commande passée** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, lot M1) — les
 * formes de la révision, communes au client et à l'équipe.
 *
 * Une modification décrit la commande VOULUE, entière : le même panier que
 * la passation (`orderContentShape`), plus la révision qu'elle corrige. Le
 * payeur, la société et la clientèle ne s'y disent pas : ils ne changent pas
 * (R2), et le serveur les relit sur la commande.
 */

/**
 * **Le panier d'une révision**, sans la révision portée : ce que le devis de
 * révision reçoit. Mêmes refus de forme que la passation.
 */
export const orderRevisionQuotePayloadSchema = z
  .object({ ...orderContentShape })
  .refine(hasAddressWhenDelivered, deliveryAddressIssue())
  .refine(hasPickupPointWhenPickedUp, pickupPointIssue());
export type OrderRevisionQuotePayload = z.infer<typeof orderRevisionQuotePayloadSchema>;

/**
 * **La modification elle-même** : la commande voulue, et la révision qu'elle
 * corrige (R7) — celle que le devis a rendue. Si la commande a été modifiée
 * ailleurs entre-temps, le serveur refuse (409) plutôt que d'écraser.
 */
export const orderRevisionPayloadSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    ...orderContentShape,
  })
  .refine(hasAddressWhenDelivered, deliveryAddressIssue())
  .refine(hasPickupPointWhenPickedUp, pickupPointIssue());
export type OrderRevisionPayload = z.infer<typeof orderRevisionPayloadSchema>;

/**
 * Une ligne de la commande modifiée. `priceFrozen` : la ligne était déjà dans
 * la révision précédente et garde son prix d'origine (R3) ; sinon elle est au
 * prix du jour. Aucune trace de règle : le devis de révision sert aussi le
 * client, et la trace dit nos marges.
 */
export interface OrderRevisionQuoteLineView {
  readonly sku: string;
  readonly productName: string;
  /** Des pièces, ou des grammes si `saleUnit = weight`. */
  readonly quantity: number;
  /** L'unité de la quantité, figée avec le prix (`vente-au-poids.md`). */
  readonly saleUnit: OrderSaleUnit;
  /** Prix unitaire HT, en millicentimes — au kilo pour une ligne au poids. */
  readonly unitPriceMillicents: number;
  readonly vatRate: number;
  readonly lineTotalCents: number;
  readonly priceFrozen: boolean;
  /**
   * Pourquoi cette quantité ne passera pas (plan
   * `documentation/promotions/plan-remises-acquises.md`, § 10.4) — `null` si
   * elle passe. La ligne refusée est chiffrée à son prix figé : le devis ne
   * montre jamais un prix substitué. La modification, elle, refuse (409).
   */
  readonly refusal: OrderRevisionLineRefusal | null;
}

/** Un prix unitaire comparé : le figé à la commande, ou celui du moment. */
export interface OrderRevisionUnitPrice {
  /** HT, millicentimes — au kilo pour une ligne au poids. */
  readonly unitPriceMillicents: number;
  readonly vatRate: number;
  /** L'étiquette TTC d'une commande de particulier ; `null` sinon. */
  readonly unitPriceTtcCents: number | null;
}

/**
 * Le refus d'une ligne déjà commandée dont la quantité change (§ 10.1) : son
 * prix changerait (les deux prix), ou l'article n'est plus vendu.
 */
export type OrderRevisionLineRefusal =
  | {
      readonly kind: "price_changed";
      readonly frozen: OrderRevisionUnitPrice;
      readonly current: OrderRevisionUnitPrice;
    }
  | { readonly kind: "withdrawn" };

/**
 * Une remise de panier que la modification ferait perdre (§ 10.2) : une ligne
 * qu'elle couvre passerait sous son seuil figé.
 */
export interface OrderRevisionDiscountRefusal {
  readonly kind: "below_threshold";
  /** Le libellé figé de la remise ; `null` sans libellé. */
  readonly label: DiscountLabelView | null;
  readonly minQuantity: number;
  /** La ligne en cause, et sa quantité révisée. */
  readonly sku: string;
  readonly quantity: number;
}

/**
 * **Le devis de révision** : la commande telle qu'elle serait, recalculée
 * comme à la passation (remise de retrait, frais, TVA), et l'écart avec la
 * révision courante. `revision` est celle sur laquelle le devis est calculé —
 * à renvoyer telle quelle dans `expectedRevision`.
 */
export interface OrderRevisionQuoteView {
  readonly revision: number;
  readonly lines: readonly OrderRevisionQuoteLineView[];
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly deliveryFeeCents: number;
  readonly lateFeeCents: number;
  readonly voucherDiscountCents: number;
  readonly vatCents: number;
  /** Le total TTC de la commande modifiée. */
  readonly totalCents: number;
  /** Le total TTC de la révision courante. */
  readonly previousTotalCents: number;
  /** `totalCents − previousTotalCents` : positif, la commande coûte plus. */
  readonly differenceCents: number;
  readonly changes: readonly OrderRevisionChange[];
  /** Les remises que la modification ferait perdre — vide si aucune (§ 10.4). */
  readonly discountRefusals: readonly OrderRevisionDiscountRefusal[];
}

/** Ce que la modification rend : la commande se relit ensuite (`GET :id`). */
export interface OrderRevisedResponse {
  readonly id: string;
  readonly revision: number;
  readonly totalCents: number;
  readonly previousTotalCents: number;
}
