import { z } from "zod";

import { deliveryAddressIssue, hasAddressWhenDelivered, orderContentShape } from "./order.js";

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
  .refine(hasAddressWhenDelivered, deliveryAddressIssue());
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
