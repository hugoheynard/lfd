import { z } from "zod";

import type { OrderRevisionChange } from "./order-revision.values.js";
import {
  deliveryAddressIssue,
  hasAddressWhenDelivered,
  hasPickupPointWhenPickedUp,
  orderContentShape,
  pickupPointIssue,
} from "./order.js";

/**
 * **Modifier une commande passée** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, lot M1) — les
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
  readonly quantity: number;
  /** Prix unitaire HT, en millicentimes. */
  readonly unitPriceMillicents: number;
  readonly vatRate: number;
  readonly lineTotalCents: number;
  readonly priceFrozen: boolean;
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
}

/** Ce que la modification rend : la commande se relit ensuite (`GET :id`). */
export interface OrderRevisedResponse {
  readonly id: string;
  readonly revision: number;
  readonly totalCents: number;
  readonly previousTotalCents: number;
}
