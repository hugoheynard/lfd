import type { BillingAddressPayload, FulfillmentWindow } from "./address.js";
import type { FulfillmentMethod } from "./order.js";
import type { OrderRevisionChange } from "./order-revision.values.js";

/**
 * **Les versions précédentes d'une commande** — `GET /admin/orders/:id/revisions`
 * (plan `documentation/commandes/modification/plan-modifier-une-commande.md`, §6, M3).
 *
 * Une entrée par modification, la plus récente en tête : qui, quand, ce qui a
 * changé, l'écart, et la composition REMPLACÉE telle qu'elle était écrite.
 * Réservé à l'équipe : le client ne voit que la commande actuelle (§6).
 */
export interface OrderRevisionEntryView {
  /** La révision remplacée : `0` est la composition de la passation. */
  readonly replacedRevision: number;
  /** Instant ISO de la modification. */
  readonly revisedAt: string;
  readonly author: OrderRevisionAuthorView;
  readonly changes: readonly OrderRevisionChange[];
  readonly totalBeforeCents: number;
  readonly totalAfterCents: number;
  /**
   * La composition remplacée ; `null` quand son JSON ne se relit pas (forme
   * inattendue) — l'écran le dit plutôt que d'inventer.
   */
  readonly replaced: ReplacedCompositionView | null;
}

/**
 * Qui a modifié. `name` : le nom de la personne (client ou fiche staff), `null`
 * quand elle n'est plus connue — jamais un nom inventé.
 */
export interface OrderRevisionAuthorView {
  readonly kind: "customer" | "staff";
  readonly name: string | null;
}

/** Une ligne de la composition remplacée, au prix qu'elle avait. */
export interface ReplacedLineView {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  /** Prix unitaire HT, en millicentimes. */
  readonly unitPriceMillicents: number;
  readonly vatRate: number;
  /** Total HT de la ligne, en centimes. */
  readonly lineTotalCents: number;
}

/** La commande telle qu'elle était avant la modification : lignes, montants, acheminement. */
export interface ReplacedCompositionView {
  /** `AAAA-MM-JJ`, ou `null`. */
  readonly requestedDeliveryDate: string | null;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly pickupAddress: BillingAddressPayload | null;
  readonly deliveryAddress: BillingAddressPayload | null;
  /** Le créneau convenu, ou `null`. */
  readonly window: FulfillmentWindow | null;
  readonly note: string;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly deliveryFeeCents: number;
  readonly vatCents: number;
  readonly totalCents: number;
  readonly lines: readonly ReplacedLineView[];
}
