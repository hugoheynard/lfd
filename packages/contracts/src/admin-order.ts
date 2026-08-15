import { z } from "zod";

import { billingAddressPayloadSchema } from "./address.js";
import {
  deliveryAddressIssue,
  fulfillmentMethodSchema,
  hasAddressWhenDelivered,
  hasPickupPointWhenPickedUp,
  pickupPointIssue,
  orderContentShape,
  orderLineInputSchema,
} from "./order.js";

/**
 * La commande **saisie par l'équipe** pour un client — au téléphone, en
 * clientèle, ou quand le client n'a pas encore d'accès.
 *
 * Ce n'est pas une autre nature de commande : les lignes, les prix, la TVA,
 * l'acheminement et le retrait sont ceux de n'importe quelle commande, et elle
 * apparaît dans « Mes commandes » du client. Ce qui change tient en deux points
 * — **qui l'a saisie** est enregistré, et **le règlement ne peut pas passer par
 * une carte** : personne chez LFC ne saisit le moyen de paiement d'un client.
 */

/**
 * Comment se règle une commande saisie par l'équipe.
 *
 * - `account` — portée au compte, facturée au terme accordé. Réservée aux
 *   sociétés qui règlent effectivement au compte : l'accorder ailleurs serait
 *   livrer à crédit sans crédit ;
 * - `link` — une intention de paiement est créée et un **lien de règlement**
 *   est rendu, que le client suit lui-même.
 *
 * Il n'y a délibérément pas de troisième valeur « carte saisie au comptoir » :
 * un numéro de carte dicté au téléphone et tapé par un commercial est
 * exactement ce qu'on ne veut pas rendre possible.
 */
export const staffSettlementSchema = z.enum(["account", "link"]);
export type StaffSettlement = z.infer<typeof staffSettlementSchema>;

/** Libellés d'écran — le code parle anglais, l'interface parle français. */
export const STAFF_SETTLEMENT_LABELS: Readonly<Record<StaffSettlement, string>> = {
  account: "Au compte, à facturer",
  link: "Lien de règlement au client",
};

/**
 * Ce que le back-office envoie pour passer une commande au nom d'un client.
 *
 * Trois champs de plus que le panier ordinaire, et aucun de moins :
 * - `companyId` est **obligatoire** — l'équipe saisit pour une société, jamais
 *   « pour personne » ; la commande sans entreprise est un parcours client ;
 * - `buyerUserId` est la personne du compte au nom de qui la commande est
 *   portée. Elle doit être **membre** de la société : c'est le serveur qui le
 *   vérifie, pas l'écran ;
 * - `settlement` n'a **pas de défaut**. Choisir entre facturer et réclamer un
 *   règlement est une décision commerciale ; un défaut silencieux la prendrait
 *   à la place du commercial, et toujours dans le même sens.
 */
export const adminPlaceOrderPayloadSchema = z
  .object({
    companyId: z.string().trim().min(1, "société requise"),
    buyerUserId: z.string().trim().min(1, "client requis"),
    settlement: staffSettlementSchema,
    ...orderContentShape,
  })
  .refine(hasAddressWhenDelivered, deliveryAddressIssue())
  .refine(hasPickupPointWhenPickedUp, pickupPointIssue());
export type AdminPlaceOrderPayload = z.infer<typeof adminPlaceOrderPayloadSchema>;

/**
 * Ce que la passation staff rend.
 *
 * `paymentUrl` n'est présent qu'en `link` : c'est l'adresse à transmettre au
 * client. Elle est **rendue à l'écran** et pas seulement envoyée par e-mail —
 * le canal e-mail n'a pas encore fait ses preuves en production, et un
 * commercial au téléphone doit pouvoir dicter ou coller le lien sur-le-champ.
 */
export interface AdminPlacedOrderResponse {
  readonly id: string;
  readonly orderNumber: string;
  readonly settlement: StaffSettlement;
  readonly totalCents: number;
  /** Présent seulement en `link`. */
  readonly paymentUrl?: string;
}

/**
 * Ce qu'un client a **déjà commandé**, agrégé par SKU.
 *
 * La raison d'être de l'écran de saisie : devant un catalogue de 92 produits,
 * le commercial n'a pas besoin d'un catalogue, il a besoin des trente lignes
 * que ce client-là reprend chaque semaine. Cette vue est ce qui transforme une
 * liste en proposition.
 */
export interface CustomerSkuStat {
  readonly sku: string;
  /** Le nom **du catalogue**, pas le snapshot d'une vieille commande. */
  readonly productName: string;
  /** Prix unitaire HT **actuel**, en centimes — celui qui sera facturé. */
  readonly unitPriceCents: number;
  /** Sur combien de commandes ce SKU apparaît. */
  readonly orderCount: number;
  /** Quantité cumulée, toutes commandes confondues. */
  readonly totalQuantity: number;
  /** Chiffre d'affaires HT cumulé sur ce SKU, en centimes. */
  readonly totalCents: number;
  /** ISO de la dernière commande où il figure. */
  readonly lastOrderedAt: string;
  /**
   * Le SKU existe-t-il encore au catalogue ? Faux = commandé autrefois, plus
   * proposable. On le montre quand même, barré : disparu de l'écran, il
   * laisserait croire que le client ne l'a jamais pris.
   */
  readonly stillAvailable: boolean;
}

/**
 * Le **brouillon** d'une commande en cours de saisie, tel qu'il est conservé.
 *
 * Un brouillon n'est pas une commande à laquelle il manquerait des champs :
 * c'est une saisie interrompue. Tout y est donc facultatif — pas d'acheteur, pas
 * de date, zéro ligne sont des états parfaitement normaux d'un appel qu'on
 * reprendra. Les invariants (au moins une ligne, une adresse quand on livre) ne
 * s'appliquent qu'à la **passation**, et c'est `adminPlaceOrderPayloadSchema` qui
 * les porte.
 *
 * On garde des faits, jamais l'état de l'écran : `deliveryAddress` est l'adresse
 * retenue, pas « la troisième du carnet ». L'écran retrouve sa sélection en
 * comparant ; l'inverse aurait figé une mise en page dans une table.
 */
export const orderDraftPayloadSchema = z.object({
  buyerUserId: z.string().trim().min(1).nullable().default(null),
  fulfillmentMethod: fulfillmentMethodSchema.default("pickup"),
  pickupAddressId: z.string().trim().min(1).nullable().default(null),
  deliveryAddress: billingAddressPayloadSchema.nullable().default(null),
  requestedDeliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ")
    .nullable()
    .default(null),
  note: z.string().default(""),
  settlement: staffSettlementSchema.default("link"),
  lines: z.array(orderLineInputSchema).default([]),
});
export type OrderDraftPayload = z.infer<typeof orderDraftPayloadSchema>;

/**
 * Le brouillon **relu**, avec sa trace : quand, et par qui.
 *
 * Un brouillon par société, partagé par l'équipe — pas un par personne. C'est le
 * compte qu'on sert, pas soi-même : un commercial qui reprend l'appel d'un
 * collègue doit retrouver ce qui a été saisi. La contrepartie est assumée : deux
 * saisies simultanées sur le même compte, et la dernière écrase l'autre. D'où la
 * trace, qui dit au moins **à qui** demander.
 */
/**
 * La lecture d'un brouillon — **enveloppée**, et volontairement.
 *
 * « Pas de brouillon » est une réponse normale, pas une absence de ressource :
 * un 404 obligerait chaque appelant à traiter une erreur pour un cas ordinaire.
 * Et un corps `null` nu se sérialise en corps **vide**, que le client relit en
 * `{}` — un objet qui ressemble à un brouillon sans en être un. L'enveloppe
 * rend la réponse lisible sans convention tacite.
 */
export interface OrderDraftResponse {
  readonly draft: OrderDraftView | null;
}

export interface OrderDraftView extends OrderDraftPayload {
  readonly companyId: string;
  /** ISO du dernier enregistrement. */
  readonly savedAt: string;
  /** La fiche staff qui l'a enregistré, ou `null` si elle a disparu depuis. */
  readonly savedByStaffId: string | null;
}
