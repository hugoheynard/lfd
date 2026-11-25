import { z } from "zod";

import {
  adminOrderEntryShape,
  hasOfferIffOffered,
  hasOfferOnlyWhenOffered,
  hasWindowWhenPickedUp,
  offerIssue,
  pickupWindowIssue,
} from "./admin-order.js";
import {
  deliveryAddressIssue,
  expectedTotalCentsSchema,
  hasAddressWhenDelivered,
  hasPickupPointWhenPickedUp,
  pickupPointIssue,
  type OrderSaleUnit,
} from "./order.js";

/**
 * **Transformer un reliquat en commande** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 4) : le
 * corps de la saisie de l'équipe, SANS la société ni les lignes — reprises du
 * reliquat, aux prix de la commande d'origine. `buyerUserId` est proposé à
 * l'acheteur d'origine et modifiable : un acheteur parti de la société est
 * refusé, l'équipe en choisit un autre.
 *
 * Strict : le port offert et l'absence de surtaxe sont imposés par le
 * serveur, et aucun champ ne permet de les ôter — un champ inconnu est un
 * refus de forme, pas une valeur ignorée.
 */
const backorderEntryShape = z
  .object(adminOrderEntryShape)
  .omit({ companyId: true, lines: true }).shape;

export const adminBackorderConvertPayloadSchema = z
  .strictObject({
    ...backorderEntryShape,
    // Le TTC que l'estimation du reliquat a montré.
    expectedTotalCents: expectedTotalCentsSchema,
  })
  .refine(hasAddressWhenDelivered, deliveryAddressIssue())
  .refine(hasPickupPointWhenPickedUp, pickupPointIssue())
  .refine(hasWindowWhenPickedUp, pickupWindowIssue())
  .refine(hasOfferIffOffered, offerIssue());
export type AdminBackorderConvertPayload = z.infer<typeof adminBackorderConvertPayloadSchema>;

/**
 * **L'estimation de la transformation** : le même corps, sans le total vu —
 * c'est elle qui le montre. Elle rend la vue de l'estimation de la saisie
 * (`AdminOrderEstimateView`).
 */
export const adminBackorderQuotePayloadSchema = z
  .strictObject(backorderEntryShape)
  .refine(hasAddressWhenDelivered, deliveryAddressIssue())
  .refine(hasPickupPointWhenPickedUp, pickupPointIssue())
  .refine(hasWindowWhenPickedUp, pickupWindowIssue())
  .refine(hasOfferOnlyWhenOffered, offerIssue());
export type AdminBackorderQuotePayload = z.infer<typeof adminBackorderQuotePayloadSchema>;

/** Les trois sorts d'un reliquat : ouvert, puis transformé ou abandonné, définitivement. */
export const BACKORDER_STATES = ["open", "converted", "abandoned"] as const;
export const backorderStateSchema = z.enum(BACKORDER_STATES);
export type BackorderState = z.infer<typeof backorderStateSchema>;

/**
 * Paramètres de `GET /admin/backorders` : l'état (`open` si absent, la liste
 * « Reliquats à traiter ») et, facultativement, une société. Sans société, la
 * liste comprend aussi les reliquats de particuliers, que l'équipe seule lit.
 */
export const adminBackorderListQuerySchema = z.strictObject({
  state: backorderStateSchema.default("open"),
  companyId: z.string().min(1).optional(),
});
export type AdminBackorderListQuery = z.infer<typeof adminBackorderListQuerySchema>;

/** Une ligne du reliquat : l'article, son nom figé sur l'origine, ce qui reste. */
export interface AdminBackorderLine {
  readonly sku: string;
  /** Le nom figé sur la commande d'origine ; le SKU si la ligne n'y est plus. */
  readonly productName: string;
  /** Des pièces, ou des GRAMMES au poids. */
  readonly quantity: number;
  readonly saleUnit: OrderSaleUnit;
}

/** Une commande liée au reliquat : son identifiant et son numéro. */
export interface AdminBackorderOrderRef {
  readonly orderId: string;
  readonly orderNumber: string;
}

/**
 * **Un reliquat, tel que l'équipe le lit** — une ligne de la liste
 * `GET /admin/backorders`, et le reliquat d'une commande d'origine sur sa
 * fiche (`AdminOrderView.backorder`).
 */
export interface AdminBackorderView {
  readonly id: string;
  readonly state: BackorderState;
  /** ISO 8601 : l'instant de la décision du départ qui l'a fait naître — son âge se lit d'ici. */
  readonly createdAt: string;
  /** La commande d'origine. */
  readonly origin: AdminBackorderOrderRef;
  /** La société de l'origine ; `null` pour un particulier. */
  readonly company: { readonly id: string; readonly name: string } | null;
  /** L'acheteur de l'origine, proposé à la transformation. */
  readonly buyer: { readonly userId: string; readonly name: string };
  readonly lines: readonly AdminBackorderLine[];
  /** La commande issue du reliquat, non nulle SSI `converted`. */
  readonly convertedOrder: AdminBackorderOrderRef | null;
  /** ISO 8601 : transformé ou abandonné ; `null` tant qu'il est ouvert. */
  readonly closedAt: string | null;
}

/**
 * Sur la fiche d'une commande **issue d'un reliquat** : le reliquat et sa
 * commande d'origine (`AdminOrderView.backorderOrigin`).
 */
export interface AdminBackorderOriginView {
  readonly backorderId: string;
  readonly origin: AdminBackorderOrderRef;
}
