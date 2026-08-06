import { z } from "zod";

import type { BillingAddressPayload } from "./address.js";

/**
 * Contrat de fil des **commandes** B2B.
 *
 * Le client n'envoie que ce qu'il **décide** : l'adresse de livraison visée, une
 * date souhaitée, une note, et des lignes `{sku, quantité}`. Il n'envoie **jamais**
 * de prix : le serveur les ré-résout depuis le catalogue (autorité). Les montants
 * apparaissent donc seulement dans les vues de **lecture**.
 */

/** Cycle de vie d'une commande (aligné sur l'enum Prisma `OrderStatus`). */
export const orderStatusSchema = z.enum([
  "draft",
  "placed",
  "confirmed",
  "in_production",
  "fulfilled",
  "cancelled",
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/**
 * État du **règlement** d'une commande (aligné sur l'enum Prisma `PaymentStatus`).
 * Découplé de {@link OrderStatus} (l'avancement de production). `not_required` =
 * facturée sur terme (net60/90/mensuel) ; `pending` = carte en attente
 * (`per_order`) ; `paid` = encaissée ; `failed`/`refunded` = échec / remboursée.
 */
export const paymentStatusSchema = z.enum([
  "not_required",
  "pending",
  "paid",
  "failed",
  "refunded",
]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/**
 * Mode d'**acheminement** d'une commande (aligné sur l'enum Prisma
 * `FulfillmentMethod`). `delivery` = livraison à une adresse ; `pickup` = retrait
 * au point de retrait (labo), fallback tant que la livraison n'existe pas.
 */
export const fulfillmentMethodSchema = z.enum(["delivery", "pickup"]);
export type FulfillmentMethod = z.infer<typeof fulfillmentMethodSchema>;

/** Une ligne demandée : un SKU et une quantité entière positive. */
export const orderLineInputSchema = z.object({
  sku: z.string().trim().min(1, "sku requis"),
  quantity: z.number().int().positive("quantité ≥ 1"),
});
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;

/**
 * Charge de passation d'une commande. `requestedDeliveryDate` est une date ISO
 * (`YYYY-MM-DD`) ou `null` ; les lignes sont non vides et dédupliquées par SKU
 * côté client (le serveur refuse un panier vide de toute façon).
 */
export const placeOrderPayloadSchema = z
  .object({
    /** Mode d'acheminement. Défaut `delivery` (rétro-compatible). */
    fulfillmentMethod: fulfillmentMethodSchema.default("delivery"),
    /** Requis si `delivery` ; ignoré (et `null`) si `pickup`. */
    deliveryAddressId: z.string().trim().nullable().default(null),
    /** Point de retrait choisi si `pickup` ; `null` = le point par défaut (serveur). */
    pickupAddressId: z.string().trim().nullable().default(null),
    requestedDeliveryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ")
      .nullable()
      .default(null),
    note: z.string().default(""),
    lines: z.array(orderLineInputSchema).min(1, "au moins une ligne"),
  })
  .refine(
    (payload) =>
      payload.fulfillmentMethod !== "delivery" ||
      (payload.deliveryAddressId !== null && payload.deliveryAddressId.length > 0),
    { message: "adresse de livraison requise", path: ["deliveryAddressId"] },
  );
export type PlaceOrderPayload = z.infer<typeof placeOrderPayloadSchema>;

// ─── Vues de LECTURE ─────────────────────────────────────────────────────────

/** Une ligne de commande, telle que renvoyée (montants en centimes, snapshots). */
export interface OrderLineView {
  readonly sku: string;
  readonly productName: string;
  readonly unitPriceCents: number;
  readonly vatRate: number;
  readonly quantity: number;
  readonly lineTotalCents: number;
}

/** Une commande, telle que la liste/le détail l'affichent. */
export interface OrderView {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  /** État du règlement (découplé de `status`, l'avancement de production). */
  readonly paymentStatus: PaymentStatus;
  readonly requestedDeliveryDate: string | null;
  /** Mode d'acheminement de cette commande. */
  readonly fulfillmentMethod: FulfillmentMethod;
  /** Adresse de livraison, ou `null` en retrait. */
  readonly deliveryAddressId: string | null;
  /** Adresse de retrait **figée** au moment de la commande, ou `null` en livraison. */
  readonly pickupAddress: BillingAddressPayload | null;
  readonly note: string;
  readonly subtotalCents: number;
  /** Remise (retrait) déduite du sous-total, en centimes. `0` si aucune. */
  readonly discountCents: number;
  /** Frais de livraison (zone) ajouté, en centimes. `0` si aucun. */
  readonly deliveryFeeCents: number;
  /** `max(0, subtotal − discount) + deliveryFee`. */
  readonly totalCents: number;
  readonly currency: string;
  /** ISO. Passée le. */
  readonly placedAt: string;
  readonly lines: readonly OrderLineView[];
}

/**
 * Détails de paiement renvoyés au checkout **quand une carte est requise**
 * (société `per_order`). Le client monte le Payment Element de Stripe avec le
 * `clientSecret` et la `publishableKey` (toutes deux non secrètes), pour le
 * montant `amountCents` (le total ré-résolu serveur). Absent = aucun paiement
 * carte requis (terme différé) : la commande est déjà passée.
 */
export interface OrderPaymentIntent {
  /** Client secret de la PaymentIntent Stripe — à passer au Payment Element. */
  readonly clientSecret: string;
  /** Clé **publique** Stripe (pk_test_… / pk_live_…) — destinée au bundle. */
  readonly publishableKey: string;
  /** Montant à encaisser, en centimes (le total serveur). Pour l'affichage. */
  readonly amountCents: number;
}

/**
 * Réponse de passation : l'identifiant et le numéro humain de la commande, plus —
 * seulement pour les sociétés `per_order` — l'intention de paiement à régler par
 * carte. `payment` absent = commande facturée sur terme, rien à encaisser au
 * checkout.
 */
export interface PlacedOrderResponse {
  readonly id: string;
  readonly orderNumber: string;
  readonly payment?: OrderPaymentIntent;
}
