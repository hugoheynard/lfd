import { z } from "zod";

import {
  billingAddressPayloadSchema,
  type BillingAddressPayload,
  deliveryContactSchema,
  type DeliveryContact,
  type FulfillmentWindow,
  fulfillmentWindowSchema,
} from "./address.js";
import { cartAdjustmentSchema, type CartAdjustment } from "./cart-adjustment.js";
import { type FulfillmentMethod, fulfillmentMethodSchema } from "./order.js";

/**
 * **Le bon de commande** — une pièce, plusieurs formats.
 *
 * Il n'existe pas de « bon de livraison » : une seule feuille, qui porte un
 * **mode d'acheminement** comme elle porte une date. Celui qui réceptionne un
 * colis et celui qui retire au comptoir cochent le même papier.
 *
 * ## Deux axes, et il ne faut pas les confondre
 *
 * - **l'audience** — client, staff, atelier — décide de **ce qu'il y a dedans** ;
 * - **le format** — écran, papier A4, texte, courriel — décide de **comment
 *   c'est rendu**.
 *
 * Ce fichier ne porte que le premier. Le second est une stratégie de rendu qui
 * prend une feuille et n'en connaît que la forme.
 *
 * ## Pourquoi une union et non un objet à champs optionnels
 *
 * `AtelierSheet` **n'a pas de propriété `money`**. Pas `null`, pas à zéro :
 * absente. Un rendu qui écrirait `sheet.money` sur une feuille d'atelier ne
 * compile pas, et aucune relecture n'a à s'en souvenir. La règle « l'atelier ne
 * voit aucun montant » cesse d'être une consigne appliquée six fois pour devenir
 * une absence de champ — *inexprimable > refusé*.
 *
 * Même mécanique pour le reste : le SKU et la trace du prix n'existent que sur
 * les lignes qui y ont droit.
 *
 * ## Ce que la feuille NE porte PAS, volontairement
 *
 * **Le jeton de remise.** Il n'est pas ici, et c'est structurel : s'il l'était,
 * tout rendu recevant une feuille pourrait l'imprimer — y compris sur le papier
 * qui voyage dans le carton, où un coursier scannerait son propre colis. Le
 * gabarit du courriel le reçoit **en second argument** ; les rendus papier n'ont
 * qu'une feuille, et imprimer le secret y est une erreur de compilation.
 *
 * Voir `documentation/order/architecture-bon-de-commande.md`.
 */

/** Qui lit cette feuille. C'est ce qui décide de ce qu'elle contient. */
export const sheetAudienceSchema = z.enum(["client", "staff", "atelier"]);
export type SheetAudience = z.infer<typeof sheetAudienceSchema>;

/**
 * L'acheminement **convenu**, aplati depuis la commande.
 *
 * La provenance de chaque valeur (`default` / `override`) n'est pas reprise :
 * elle explique une décision de composition à un commercial, elle n'a rien à
 * faire sur un papier qu'on lit pour préparer ou pour recevoir.
 */
export const sheetFulfillmentSchema = z.object({
  method: fulfillmentMethodSchema,
  /** L'adresse qui compte : livrée en coursier, le point de retrait sinon. */
  address: billingAddressPayloadSchema.nullable(),
  window: fulfillmentWindowSchema.nullable(),
  contact: deliveryContactSchema.nullable(),
  signatureRequired: z.boolean(),
});
export interface SheetFulfillment {
  readonly method: FulfillmentMethod;
  readonly address: BillingAddressPayload | null;
  readonly window: FulfillmentWindow | null;
  readonly contact: DeliveryContact | null;
  readonly signatureRequired: boolean;
}

/**
 * Les montants de la commande, **figés**. Rien ici ne se recalcule : la
 * résolution a eu lieu à la passation, et une seconde version de la vérité
 * finirait par contredire la facture.
 *
 * La TVA est un **total**, pas une ventilation par taux : la commande n'en
 * conserve pas le détail, et l'inventer sur une feuille serait affirmer un
 * découpage que personne n'a écrit.
 */
export const sheetMoneySchema = z.object({
  subtotalCents: z.number().int(),
  discountCents: z.number().int(),
  /** Ce qui a produit la remise — sans lui, on ne sait dire qu'un montant. */
  discountAdjustment: cartAdjustmentSchema.nullable(),
  deliveryFeeCents: z.number().int(),
  lateFeeCents: z.number().int(),
  vatCents: z.number().int(),
  totalCents: z.number().int(),
  currency: z.string().min(1),
});
export interface SheetMoney {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly discountAdjustment: CartAdjustment | null;
  readonly deliveryFeeCents: number;
  readonly lateFeeCents: number;
  readonly vatCents: number;
  readonly totalCents: number;
  readonly currency: string;
}

/**
 * Ce que toute ligne porte : ce qu'on prépare et combien.
 *
 * Le nom est celui **figé à la commande**, pas celui du catalogue d'aujourd'hui.
 */
const lineCommonShape = {
  productName: z.string().min(1),
  quantity: z.number().int().positive(),
} as const;

/** L'atelier : ce qu'on fabrique, et par quel SKU on le retrouve. Aucun prix. */
export const atelierSheetLineSchema = z.object({
  ...lineCommonShape,
  sku: z.string().min(1),
});
export interface AtelierSheetLine {
  readonly productName: string;
  readonly quantity: number;
  readonly sku: string;
}

/**
 * Le client : ce qu'il paie, et les **libellés** des gestes tarifaires.
 *
 * 🔴 **Pas de SKU, pas de nom d'étage.** Le SKU est un identifiant de maison ;
 * `priceLabels` ne porte que le `label` d'un étage, celui que le contrat déclare
 * **destiné au client** (« Promotion de rentrée »), jamais son `stage` ni son
 * `ruleId`. C'est une règle d'API avant d'être une règle d'écran : masquée au
 * rendu, la grille tarifaire resterait lisible dans l'onglet réseau, et trois
 * commandes empilées la reconstitueraient.
 */
export const clientSheetLineSchema = z.object({
  ...lineCommonShape,
  unitPriceMillicents: z.number().int(),
  vatRate: z.number(),
  lineTotalCents: z.number().int(),
  priceLabels: z.array(z.string().min(1)),
});
export interface ClientSheetLine {
  readonly productName: string;
  readonly quantity: number;
  readonly unitPriceMillicents: number;
  readonly vatRate: number;
  readonly lineTotalCents: number;
  readonly priceLabels: readonly string[];
}

/**
 * Le staff : tout ce que voit le client, plus **de quoi répondre au téléphone**.
 *
 * `entryPriceMillicents` est le tarif d'entrée quand il diffère du facturé —
 * `null` quand aucune règle n'a joué **ou** quand la ligne ne porte pas de
 * trace. Les deux se rendent pareil (il n'y a rien à barrer), et l'absence n'est
 * jamais remplacée par le prix facturé : ce serait affirmer « aucune
 * altération » sur les seules commandes qu'on ne peut plus vérifier.
 *
 * `floored` dit qu'une limite a **relevé** le prix — le signe qu'une règle n'a
 * pas produit son effet, et exactement ce qu'un client remarque avant nous.
 */
export const staffSheetLineSchema = clientSheetLineSchema.extend({
  sku: z.string().min(1),
  entryPriceMillicents: z.number().int().nullable(),
  floored: z.boolean(),
});
export interface StaffSheetLine extends ClientSheetLine {
  readonly sku: string;
  readonly entryPriceMillicents: number | null;
  readonly floored: boolean;
}

/**
 * Ce que toute feuille porte, quelle que soit son audience.
 *
 * `issuedAt` et `revision` ne sont **pas** décoratifs : ils identifient le
 * tirage. `issuedAt` est l'instant où la **révision est devenue vraie** — la
 * passation pour `revision: 0`, l'avenant ensuite — et non l'instant du rendu.
 * C'est ce qui rend deux rendus de la même révision **identiques au bit près**,
 * donc le rangement en R2 idempotent sans verrou. Un `clock.now()` au rendu
 * casserait cette propriété sans rien afficher de faux.
 */
const sheetCommonShape = {
  orderId: z.string().min(1),
  /** La référence humaine, `CMD-4812`. C'est elle que le QR d'atelier encode. */
  reference: z.string().min(1),
  placedAt: z.string().min(1),
  requestedFor: z.string().nullable(),
  fulfillment: sheetFulfillmentSchema,
  note: z.string(),
  issuedAt: z.string().min(1),
  /** Nombre d'avenants appliqués depuis la passation. `0` = la commande d'origine. */
  revision: z.number().int().nonnegative(),
} as const;

interface SheetCommon {
  readonly orderId: string;
  readonly reference: string;
  readonly placedAt: string;
  readonly requestedFor: string | null;
  readonly fulfillment: SheetFulfillment;
  readonly note: string;
  readonly issuedAt: string;
  readonly revision: number;
}

/** La feuille du fournil. **Aucune propriété monétaire** — pas même absente. */
export const atelierSheetSchema = z.object({
  ...sheetCommonShape,
  audience: z.literal("atelier"),
  lines: z.array(atelierSheetLineSchema),
});
export interface AtelierSheet extends SheetCommon {
  readonly audience: "atelier";
  readonly lines: readonly AtelierSheetLine[];
}

/** La feuille du client : son engagement, dans ses mots. */
export const clientSheetSchema = z.object({
  ...sheetCommonShape,
  audience: z.literal("client"),
  lines: z.array(clientSheetLineSchema),
  money: sheetMoneySchema,
});
export interface ClientSheet extends SheetCommon {
  readonly audience: "client";
  readonly lines: readonly ClientSheetLine[];
  readonly money: SheetMoney;
}

/** La même, **augmentée** — c'est la promesse d'un seul composant à trois lectures. */
export const staffSheetSchema = z.object({
  ...sheetCommonShape,
  audience: z.literal("staff"),
  lines: z.array(staffSheetLineSchema),
  money: sheetMoneySchema,
});
export interface StaffSheet extends SheetCommon {
  readonly audience: "staff";
  readonly lines: readonly StaffSheetLine[];
  readonly money: SheetMoney;
}

/**
 * Le bon de commande, toutes audiences. Discriminé par `audience` : un rendu qui
 * veut un montant doit **prouver** qu'il n'est pas devant une feuille d'atelier.
 */
export const orderSheetSchema = z.discriminatedUnion("audience", [
  atelierSheetSchema,
  clientSheetSchema,
  staffSheetSchema,
]);
export type OrderSheet = AtelierSheet | ClientSheet | StaffSheet;

/** Les feuilles qui portent des montants — le type que prend un rendu chiffré. */
export type PricedSheet = ClientSheet | StaffSheet;
