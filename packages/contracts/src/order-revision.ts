import { z } from "zod";

import type { DiscountLabelView } from "./discount-label.js";
import type { OrderRevisionChange, OrderRevisionQuoteSettlement } from "./order-revision.values.js";
import {
  deliveryAddressIssue,
  expectedTotalCentsSchema,
  hasAddressWhenDelivered,
  hasPickupPointWhenPickedUp,
  orderContentShape,
  type OrderSaleUnit,
  pickupPointIssue,
} from "./order.js";

/**
 * **Modifier une commande passée** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification ») — les
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

/** La commande voulue et la révision qu'elle corrige (R7) — commun à la modification et à sa demande. */
const revisedOrderShape = {
  expectedRevision: z.number().int().nonnegative(),
  ...orderContentShape,
};

/**
 * **La composition d'une demande de modification** (M4) : la commande voulue
 * et la révision corrigée, SANS total vu. La demande ne modifie rien : le
 * total qui compte est celui que l'équipe voit au moment d'appliquer
 * (`orderChangeApplyPayloadSchema`, doc `modifier-une-commande.md`, §2.3 (R14)) — le
 * garder ici le rangerait dans la composition demandée.
 */
export const requestedOrderRevisionSchema = z
  .object(revisedOrderShape)
  .refine(hasAddressWhenDelivered, deliveryAddressIssue())
  .refine(hasPickupPointWhenPickedUp, pickupPointIssue());

/**
 * **La modification elle-même** : la commande voulue, et la révision qu'elle
 * corrige (R7) — celle que le devis a rendue. Si la commande a été modifiée
 * ailleurs entre-temps, le serveur refuse (409) plutôt que d'écraser.
 *
 * `expectedTotalCents` est le TTC du devis affiché, obligatoire (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.3 (R14)) : une
 * modification ne fixe jamais un montant que personne n'a vu — `409`
 * `orders.total_changed`, comme la passation.
 */
export const orderRevisionPayloadSchema = z
  .object({ ...revisedOrderShape, expectedTotalCents: expectedTotalCentsSchema })
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
  /**
   * Comment la modification se réglera (doc
   * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.2) : comme
   * la commande, par un complément à payer par carte, ou pas encore possible.
   * Servi sur tout devis depuis S2.b (`quoteViewOf`, vérifié le
   * 2026-11-10) ; obligatoire depuis que les écrans le lisent (S2.d).
   */
  readonly settlement: OrderRevisionQuoteSettlement;
}

/** Ce que la modification rend : la commande se relit ensuite (`GET :id`). */
export interface OrderRevisedResponse {
  readonly id: string;
  readonly revision: number;
  readonly totalCents: number;
  readonly previousTotalCents: number;
}

/**
 * **Demander une hausse payée par carte** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.3) — le
 * corps de `POST /orders/:id/revisions/card-increase` : exactement celui de
 * la modification (`orderRevisionPayloadSchema`), total vu obligatoire (R14).
 */
export const cardIncreasePayloadSchema = orderRevisionPayloadSchema;
export type CardIncreasePayload = OrderRevisionPayload;

/**
 * **Le complément à payer** — la réponse de `POST
 * /orders/:id/revisions/card-increase` (§2.4) et de `GET
 * /orders/:id/complement` (§2.5, la reprise au rechargement). La commande ne
 * change pas tant que le complément n'est pas payé : la boutique monte le
 * formulaire de carte avec `clientSecret` et `publishableKey`, et dit le
 * délai (`expiresAt`, ISO — 15 minutes, raccourci à l'heure limite).
 */
export interface CardComplementPaymentView {
  readonly proposalId: string;
  readonly complementCents: number;
  readonly clientSecret: string;
  readonly publishableKey: string;
  readonly expiresAt: string;
}
