import { z } from "zod";

import {
  billingAddressPayloadSchema,
  fulfillmentWindowSchema,
  type FulfillmentWindow,
} from "./address.js";
import {
  deliveryAddressIssue,
  fulfillmentMethodSchema,
  hasAddressWhenDelivered,
  hasPickupPointWhenPickedUp,
  pickupPointIssue,
  orderContentShape,
  orderLineInputSchema,
  type FulfillmentMethod,
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
 * **Une commande de RETRAIT saisie par l'équipe porte une tranche horaire.**
 *
 * 🔴 Jusqu'au 2026-09-11, l'écran de saisie n'en envoyait aucune et un retrait
 * ne prend **aucun défaut** (les heures d'un point sont une contrainte
 * d'ouverture partagée, pas la préférence d'un client) : toute commande prise au
 * téléphone arrivait au comptoir sans créneau. Elle n'avait alors aucun rang
 * dans la file, personne ne savait quand attendre le client, et rien ne pouvait
 * être « en retard ». Un retard se gère ; une absence d'heure, non.
 *
 * ⚠️ **Le refus vit ICI et pas seulement à l'écran**, et c'est un choix
 * d'Hugo contre ma réserve : un onglet de back-office resté ouvert garde son
 * bundle et postera sans tranche jusqu'au rechargement, donc ce resserrement
 * REFUSE des requêtes qu'un client déployé peut encore émettre (CLAUDE.md §0).
 * Le refus est explicite et nomme le geste — il coûte un rechargement au
 * commercial, là où la règle laissée à l'écran laissait entrer indéfiniment la
 * donnée qu'on bannit. Le message est lu par du personnel sans le code sous les
 * yeux : il dit quoi faire, pas ce qui manque.
 *
 * ⚠️ **En coursier, rien n'est exigé** : la fenêtre légitime d'une livraison est
 * celle du CARNET, que le serveur lit à partir de l'adresse. L'exiger dans la
 * charge utile ferait écraser par l'écran ce que le compte a déclaré.
 *
 * 🔴 **Et seulement sur la saisie STAFF.** `placeOrderPayloadSchema`, le
 * parcours client, n'est pas touché : son dialogue de retrait n'émet déjà que
 * si une tranche est choisie, et resserrer un contrat servi à une app cliente
 * installée est une autre affaire que le back-office.
 *
 * ⚠️ **Le refus est au RUNTIME, pas au type.** Un `refine` ne narrowe rien :
 * `AdminPlaceOrderPayload` laisse toujours `requestedWindow` facultatif, donc
 * un appelant qui l'omet compile et échoue à l'exécution. Rendre la chose
 * inexprimable demanderait deux variantes du payload discriminées par
 * l'acheminement — plus cher que ce que ça achète tant qu'il n'y a qu'un
 * appelant. Ne pas compter sur `tsc` pour l'attraper.
 */
export function hasWindowWhenPickedUp(content: {
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly requestedWindow?: FulfillmentWindow | null | undefined;
}): boolean {
  return (
    content.fulfillmentMethod !== "pickup" ||
    (content.requestedWindow !== null && content.requestedWindow !== undefined)
  );
}

/** Le message et le chemin du refus ci-dessus — cf. `pickupPointIssue`. */
export function pickupWindowIssue(): { message: string; path: PropertyKey[] } {
  return {
    message: "choisissez un créneau de retrait — il est convenu avec le client, pas facultatif",
    path: ["requestedWindow"],
  };
}

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
  .refine(hasPickupPointWhenPickedUp, pickupPointIssue())
  .refine(hasWindowWhenPickedUp, pickupWindowIssue());
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
  /** Prix unitaire HT **actuel**, en **millicentimes** — celui qui sera facturé. */
  readonly unitPriceMillicents: number;
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
  /**
   * La tranche convenue au téléphone. `null` = **pas encore choisie**.
   *
   * ⚠️ Un brouillon est une saisie INTERROMPUE : il a le droit de ne rien
   * porter, comme il a le droit de n'avoir ni acheteur ni ligne. L'exiger ici
   * refuserait d'enregistrer un appel coupé au milieu, c'est-à-dire exactement
   * ce pour quoi le brouillon existe.
   *
   * 🔴 **Le créneau est obligatoire à la PASSATION**, et c'est
   * `adminPlaceOrderPayloadSchema` qui le refuse — cf.
   * {@link hasWindowWhenPickedUp}. Pas l'écran seul : une règle tenue par un
   * écran est le degré le plus faible de la hiérarchie du dossier, et il reste
   * toujours une porte de derrière (un onglet ancien, un `curl`, une reprise de
   * brouillon mal branchée).
   *
   * Ajouté le 2026-09-11 : la saisie staff n'envoyait AUCUNE tranche, donc toute
   * commande prise au téléphone arrivait au comptoir sans créneau — la file ne
   * pouvait pas juger son retard, et l'équipe ne savait pas quand attendre le
   * client. L'écran le demande maintenant ; le brouillon doit s'en souvenir,
   * sans quoi la réponse se perdrait au premier appel interrompu.
   *
   * ⚠️ **Additif et rétrocompatible** : les brouillons déjà stockés ne portent
   * pas la clé, et le `default(null)` la leur donne à la relecture. Le payload
   * est une colonne `Json` revalidée à l'entrée comme à la sortie — il n'y a
   * donc rien à migrer.
   */
  requestedWindow: fulfillmentWindowSchema.nullable().default(null),
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
