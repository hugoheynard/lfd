import { z } from "zod";

import {
  adminOrderEntryShape,
  hasOfferIffOffered,
  hasOfferOnlyWhenOffered,
  hasWindowWhenPickedUp,
  offerIssue,
  orderOfferSchema,
  pickupWindowIssue,
  type OrderOffer,
} from "./admin-order.js";
import {
  deliveryAddressIssue,
  expectedTotalCentsSchema,
  hasAddressWhenDelivered,
  hasPickupPointWhenPickedUp,
  orderContentShape,
  pickupPointIssue,
  type OrderSaleUnit,
} from "./order.js";

/**
 * **Transformer un reliquat en commande** (`documentation/commandes/reliquat/reliquat.md`, § 6.3) : le
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

/**
 * **Les deux lieux de règlement d'un reliquat de particulier** (plan, § 5 bis,
 * décision 13) : la caisse de la boutique, au retrait — notre système
 * n'encaisse rien —, ou offerte, sous le droit d'offrir.
 */
export const BACKORDER_PARTICULAR_VENUES = ["shop_till", "offered"] as const;
export const backorderParticularVenueSchema = z.enum(BACKORDER_PARTICULAR_VENUES);
export type BackorderParticularVenue = z.infer<typeof backorderParticularVenueSchema>;

/**
 * Le corps d'un reliquat de **particulier** : le lieu de règlement, et le
 * panier de la saisie du particulier SANS ses lignes (reprises du reliquat).
 * `buyerUserId` absent : l'acheteur d'origine, qui passe le mur du
 * particulier comme à la saisie du comptoir. Strict, comme le corps pro : le
 * port offert et l'absence de surtaxe ne s'expriment pas.
 */
const backorderParticularEntryShape = {
  venue: backorderParticularVenueSchema,
  buyerUserId: z.string().trim().min(1, "client requis").optional(),
  // Le motif d'une commande offerte : exigé avec `offered` à la transformation.
  offer: orderOfferSchema.optional(),
  ...z.object(orderContentShape).omit({ lines: true }).shape,
};

interface ParticularVenueAndOffer {
  readonly venue: BackorderParticularVenue;
  readonly offer?: OrderOffer | undefined;
}

/** Offerte ⇔ motif, à la transformation. */
function hasOfferIffVenueOffered(payload: ParticularVenueAndOffer): boolean {
  return (payload.venue === "offered") === (payload.offer !== undefined);
}

/** L'estimation admet `offered` sans motif ; la caisse de la boutique n'en porte jamais. */
function hasOfferOnlyWhenVenueOffered(payload: ParticularVenueAndOffer): boolean {
  return payload.offer === undefined || payload.venue === "offered";
}

export const adminBackorderParticularConvertPayloadSchema = z
  .strictObject({
    ...backorderParticularEntryShape,
    // Le TTC que l'estimation du reliquat a montré : zéro pour une offerte.
    expectedTotalCents: expectedTotalCentsSchema,
  })
  .refine(hasAddressWhenDelivered, deliveryAddressIssue())
  .refine(hasPickupPointWhenPickedUp, pickupPointIssue())
  .refine(hasWindowWhenPickedUp, pickupWindowIssue())
  .refine(hasOfferIffVenueOffered, offerIssue());
export type AdminBackorderParticularConvertPayload = z.infer<
  typeof adminBackorderParticularConvertPayloadSchema
>;

export const adminBackorderParticularQuotePayloadSchema = z
  .strictObject(backorderParticularEntryShape)
  .refine(hasAddressWhenDelivered, deliveryAddressIssue())
  .refine(hasPickupPointWhenPickedUp, pickupPointIssue())
  .refine(hasWindowWhenPickedUp, pickupWindowIssue())
  .refine(hasOfferOnlyWhenVenueOffered, offerIssue());
export type AdminBackorderParticularQuotePayload = z.infer<
  typeof adminBackorderParticularQuotePayloadSchema
>;

/**
 * **Le corps de `convert`** : celui d'un pro (la saisie de l'équipe) ou celui
 * d'un particulier, reconnu à son `venue`. Les deux sont stricts, donc
 * exclusifs : un corps pro qui porterait `venue` est refusé, et l'inverse.
 * Le serveur refuse ensuite un corps qui ne correspond pas au reliquat.
 */
export const adminBackorderConvertBodySchema = z.union([
  adminBackorderParticularConvertPayloadSchema,
  adminBackorderConvertPayloadSchema,
]);
export type AdminBackorderConvertBody = z.infer<typeof adminBackorderConvertBodySchema>;

/** Le corps de `quote`, sur la même partition. */
export const adminBackorderQuoteBodySchema = z.union([
  adminBackorderParticularQuotePayloadSchema,
  adminBackorderQuotePayloadSchema,
]);
export type AdminBackorderQuoteBody = z.infer<typeof adminBackorderQuoteBodySchema>;

/** Le corps est-il celui d'un particulier ? Le `venue` n'existe que chez lui. */
export function isParticularBackorderBody<
  P extends { readonly venue: BackorderParticularVenue },
  Q extends object,
>(body: P | Q): body is P {
  return "venue" in body;
}

/** Ce que rend la transformation d'un reliquat de particulier : la commande et son TTC. */
export interface AdminBackorderParticularPlacedResponse {
  readonly id: string;
  readonly orderNumber: string;
  readonly venue: BackorderParticularVenue;
  /** Le TTC à encaisser à la caisse de la boutique ; zéro pour une offerte. */
  readonly totalCents: number;
}

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
