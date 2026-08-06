import { z } from "zod";

import { billingAddressPayloadSchema, type BillingAddressPayload } from "./address.js";

/**
 * Contrat de fil des **commandes** B2B.
 *
 * Le client n'envoie que ce qu'il **décide** : l'acheminement (coursier + zone +
 * adresse libre, ou retrait au labo), une date souhaitée, une note, et des lignes
 * `{sku, quantité}`. Il n'envoie **jamais** de prix : le serveur les ré-résout
 * depuis le catalogue et **re-résout le frais de la zone** depuis son `id`
 * (autorité). Les montants apparaissent donc seulement dans les vues de **lecture**.
 *
 * **Zéro friction** : `companyId` est **optionnel**. Sans entreprise, la commande
 * appartient au client connecté et se règle par carte (`per_order`). Avec une
 * entreprise active à terme différé, elle est facturée hors ligne.
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
 * `FulfillmentMethod`). `delivery` = **coursier** vers une zone + adresse libre ;
 * `pickup` = **retrait** au point de retrait (labo).
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
 *
 * `companyId` est **optionnel** : `null` = commande personnelle (le client
 * connecté). En **coursier** (`delivery`), le client choisit une **zone**
 * (`deliveryZoneId`, dont le serveur re-résout le frais) et saisit une **adresse
 * de livraison libre** (`deliveryAddress`) ; les deux sont requises. En **retrait**
 * (`pickup`), `pickupAddressId` `null` = le point par défaut (labo, résolu serveur).
 */
export const placeOrderPayloadSchema = z
  .object({
    /** Entreprise cliente, ou `null` = commande personnelle (client connecté). */
    companyId: z.string().trim().min(1).nullable().default(null),
    /** Mode d'acheminement. Défaut `pickup` (aucun extra requis). */
    fulfillmentMethod: fulfillmentMethodSchema.default("pickup"),
    /** Zone de livraison choisie (coursier) — le serveur en re-résout le frais. */
    deliveryZoneId: z.string().trim().nullable().default(null),
    /** Adresse de livraison libre (coursier) — requise si `delivery`. */
    deliveryAddress: billingAddressPayloadSchema.nullable().default(null),
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
      (payload.deliveryZoneId !== null && payload.deliveryZoneId.length > 0),
    { message: "zone de livraison requise", path: ["deliveryZoneId"] },
  )
  .refine(
    (payload) => payload.fulfillmentMethod !== "delivery" || payload.deliveryAddress !== null,
    { message: "adresse de livraison requise", path: ["deliveryAddress"] },
  );
export type PlaceOrderPayload = z.infer<typeof placeOrderPayloadSchema>;

// ─── Vues de LECTURE ─────────────────────────────────────────────────────────

/** Une ligne (SKU + quantité) figurant dans un écart vis-à-vis d'un gabarit récurrent. */
const recurringDeltaLineSchema = z.object({
  sku: z.string(),
  quantity: z.number().int().nonnegative(),
});
export type RecurringDeltaLine = z.infer<typeof recurringDeltaLineSchema>;

/**
 * Écart d'une commande **issue d'un panier récurrent** vis-à-vis de son gabarit :
 * `added` = lignes ajoutées pour cette échéance (pill « + »), `removed` = lignes
 * retirées (pill « − »). Absent tant qu'aucune commande n'est produite par un
 * abonnement (le planificateur les stampera).
 */
export const recurringDeltasSchema = z.object({
  added: z.array(recurringDeltaLineSchema),
  removed: z.array(recurringDeltaLineSchema),
});
export type RecurringDeltas = z.infer<typeof recurringDeltasSchema>;

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
  /** Adresse de livraison d'entreprise (héritage), ou `null`. */
  readonly deliveryAddressId: string | null;
  /** Adresse de livraison **libre figée** (coursier), ou `null` en retrait. */
  readonly deliveryAddress: BillingAddressPayload | null;
  /** Adresse de retrait **figée** au moment de la commande, ou `null` en livraison. */
  readonly pickupAddress: BillingAddressPayload | null;
  readonly note: string;
  /** Sous-total marchandises **HT**, en centimes. */
  readonly subtotalCents: number;
  /** Remise (retrait) déduite du sous-total, en centimes. `0` si aucune. */
  readonly discountCents: number;
  /** Frais de livraison (zone) ajouté, HT, en centimes. `0` si aucun. */
  readonly deliveryFeeCents: number;
  /** TVA totale (marchandises par taux + livraison), en centimes. */
  readonly vatCents: number;
  /** Total **TTC** = `max(0, subtotal − discount) + deliveryFee + vat`. */
  readonly totalCents: number;
  readonly currency: string;
  /** Panier récurrent d'origine (« récurrent »), ou `null` (commande ponctuelle). */
  readonly fromSubscriptionId: string | null;
  /** Écarts vs le gabarit récurrent (pills +/−), ou `null` si non issue d'un abonnement. */
  readonly recurringDeltas: RecurringDeltas | null;
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
