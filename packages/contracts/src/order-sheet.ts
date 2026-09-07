import { z } from "zod";

import {
  billingAddressPayloadSchema,
  type BillingAddressPayload,
  type FulfillmentWindow,
  fulfillmentWindowSchema,
} from "./address.js";
import { cartAdjustmentSchema, type CartAdjustment } from "./cart-adjustment.js";
import {
  type FulfillmentMethod,
  fulfillmentMethodSchema,
  type OrderOrigin,
  orderOriginSchema,
} from "./order.js";

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
 * **Qui appeler** en remettant. Le livreur sonne à une porte : il lui faut un nom
 * et un numéro, pas une raison sociale.
 *
 * `source` n'est pas décoratif. `order` = le contact **convenu sur la commande**,
 * ce que le client a vu à l'écran en validant. `holder` = à défaut, le détenteur
 * du compte : quelqu'un à qui parler, mais qui n'a pas forcément été prévenu — et
 * ça change ce qu'on dit en décrochant.
 *
 * `null` (le champ entier) = rien de convenu et pas de détenteur. La feuille le
 * **dit** alors : le livreur doit savoir qu'il part sans numéro, pas le
 * découvrir devant la porte.
 */
export const sheetContactSchema = z.object({
  source: z.enum(["order", "holder"]),
  name: z.string().min(1),
  /** Peut être vide : un détenteur sans téléphone reste un nom à demander. */
  phone: z.string(),
});
export interface SheetContact {
  readonly source: "order" | "holder";
  readonly name: string;
  readonly phone: string;
}

/**
 * **À qui** cette commande appartient — ce que le fournil cherche en premier sur
 * une pile de feuilles.
 *
 * Deux noms, et il en faut deux : l'**enseigne** est celle qui est peinte sur la
 * devanture et que le fournil connaît ; la **raison sociale** lève l'ambiguïté
 * entre deux enseignes voisines et c'est elle qui figure sur les papiers.
 *
 * Sur une commande **sans entreprise** (zéro friction), l'enseigne est vide et
 * `legalName` porte seul le nom de la personne : une feuille a toujours
 * quelqu'un à qui remettre, même quand ce n'est pas une société.
 */
export const sheetCustomerSchema = z.object({
  tradeName: z.string(),
  legalName: z.string().min(1),
});
export interface SheetCustomer {
  readonly tradeName: string;
  readonly legalName: string;
}

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
  /**
   * Le point de retrait **nommé** (« Le Labo »), quand c'en est un et qu'il en
   * porte un. Distinct de l'adresse : on dit le nom au téléphone, on lit
   * l'adresse pour s'y rendre, et le libellé seul ne suffit à ni l'un ni l'autre.
   */
  pickupLabel: z.string().nullable(),
  window: fulfillmentWindowSchema.nullable(),
  contact: sheetContactSchema.nullable(),
  signatureRequired: z.boolean(),
});
export interface SheetFulfillment {
  readonly method: FulfillmentMethod;
  readonly address: BillingAddressPayload | null;
  readonly pickupLabel: string | null;
  readonly window: FulfillmentWindow | null;
  readonly contact: SheetContact | null;
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
  /**
   * Par quelle porte la commande est entrée. Le client le voit aussi, et c'est
   * voulu : « saisie par l'équipe » explique une commande qu'il ne se souvient
   * pas d'avoir passée.
   */
  origin: orderOriginSchema,
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
  readonly origin: OrderOrigin;
  readonly issuedAt: string;
  readonly revision: number;
}

/**
 * La feuille du fournil. **Aucune propriété monétaire** — pas même absente.
 *
 * Elle porte le **client**, et c'est ce qui la rend utilisable : « celui qui
 * prépare cherche d'abord le client, celui qui charge cherche l'adresse ». Une
 * feuille d'atelier anonyme est une feuille qu'on ne peut pas poser sur la
 * bonne pile.
 */
export const atelierSheetSchema = z.object({
  ...sheetCommonShape,
  audience: z.literal("atelier"),
  customer: sheetCustomerSchema,
  lines: z.array(atelierSheetLineSchema),
});
export interface AtelierSheet extends SheetCommon {
  readonly audience: "atelier";
  readonly customer: SheetCustomer;
  readonly lines: readonly AtelierSheetLine[];
}

/**
 * La feuille du client : son engagement, dans ses mots.
 *
 * ⚠️ **Elle ne porte pas `customer`, et ce n'est pas un oubli.** Un bon de
 * commande qu'on vous tend n'a pas à vous dire qui vous êtes — tout le reste y
 * est déjà à vous. Le client sert à retrouver la bonne pile au fournil et à
 * décrocher le bon téléphone au bureau : deux besoins que le client lui-même
 * n'a pas. C'est la même logique d'audience que les montants sur la feuille
 * d'atelier, appliquée dans l'autre sens.
 */
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
  customer: sheetCustomerSchema,
  lines: z.array(staffSheetLineSchema),
  money: sheetMoneySchema,
});
export interface StaffSheet extends SheetCommon {
  readonly audience: "staff";
  readonly customer: SheetCustomer;
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
