import { z } from "zod";

import type { BillingAddressPayload } from "./address.js";
import type { FulfillmentMethod, OrderOrigin } from "./order.js";

/**
 * Les **fiches de fonction** d'un service : ce que le labo doit fabriquer pour
 * une date donnée, une feuille par commande, plus une récapitulation.
 *
 * C'est un papier, pas un écran. La production n'a pas de suivi en ligne : elle
 * reçoit une pile de feuilles à la clôture et travaille dessus. Deux
 * conséquences qui expliquent la forme de ce contrat :
 *
 * - **aucun montant.** Une fiche sert à FABRIQUER. Un prix n'aide personne au
 *   fournil, et une feuille oubliée sur un plan de travail ne doit pas raconter
 *   les marges de la maison à qui la ramasse ;
 * - **un lot dénombrable.** Le papier ne répond pas : si l'imprimante manque de
 *   feuilles, une commande cesse d'exister pour la production sans que personne
 *   l'apprenne. Le lot porte donc son compte, et chaque fiche son rang — une
 *   absence se voit, au lieu d'être silencieuse.
 */

/** La date d'un lot : le jour de **service** (retrait ou livraison), pas de commande. */
export const productionBatchQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ"),
});
export type ProductionBatchQuery = z.infer<typeof productionBatchQuerySchema>;

/** Une ligne à fabriquer. Ni prix unitaire, ni TVA, ni total : on produit. */
export interface ProductionSheetLine {
  readonly sku: string;
  /** Le nom **figé à la commande** — le catalogue a pu bouger depuis. */
  readonly productName: string;
  readonly quantity: number;
}

/** Une fiche : une commande, telle qu'on la fabrique et telle qu'on la remet. */
export interface ProductionSheet {
  readonly orderId: string;
  readonly orderNumber: string;
  /** La raison sociale, ou la personne quand la commande est sans entreprise. */
  readonly customerLabel: string;
  readonly fulfillmentMethod: FulfillmentMethod;
  /** Le point de retrait nommé, quand c'est un retrait et qu'il en porte un. */
  readonly pickupLabel: string | null;
  /** L'adresse servie, quand c'est un coursier. */
  readonly deliveryAddress: BillingAddressPayload | null;
  /** La note du client — consigne de fabrication ou d'accès, elle se lit au labo. */
  readonly note: string;
  /** Par quelle porte la commande est entrée (récurrente, saisie, self-service). */
  readonly origin: OrderOrigin;
  readonly lines: readonly ProductionSheetLine[];
}

/**
 * Le lot d'un jour. `sheets` est ordonné de façon **stable** (par référence de
 * commande) pour qu'une réimpression rende exactement la même pile, dans le même
 * ordre, avec les mêmes rangs.
 */
export interface ProductionBatchView {
  /** `AAAA-MM-JJ`, la journée servie. */
  readonly date: string;
  readonly sheets: readonly ProductionSheet[];
  /**
   * Les commandes **sans date de service**, tous jours confondus. Elles
   * n'entrent dans aucun lot : sans ce compte, elles seraient invisibles pour la
   * production sans que rien ne le signale. L'écran le dit ; c'est au staff de
   * leur donner une date.
   */
  readonly undatedCount: number;
}
