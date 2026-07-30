import { z } from "zod";

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
export const placeOrderPayloadSchema = z.object({
  deliveryAddressId: z.string().trim().min(1, "adresse de livraison requise"),
  requestedDeliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ")
    .nullable()
    .default(null),
  note: z.string().default(""),
  lines: z.array(orderLineInputSchema).min(1, "au moins une ligne"),
});
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
  readonly requestedDeliveryDate: string | null;
  readonly deliveryAddressId: string;
  readonly note: string;
  readonly subtotalCents: number;
  readonly totalCents: number;
  readonly currency: string;
  /** ISO. Passée le. */
  readonly placedAt: string;
  readonly lines: readonly OrderLineView[];
}

/** Réponse de passation : l'identifiant et le numéro humain de la commande. */
export interface PlacedOrderResponse {
  readonly id: string;
  readonly orderNumber: string;
}
