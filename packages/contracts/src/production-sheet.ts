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
 *
 * Le lot est **exhaustif par construction** : une commande ne peut pas être
 * passée sans jour de retrait/livraison (cf. `orderContentShape`), donc aucune
 * ne peut échapper à une journée. C'est l'invariant qui garantit la couverture,
 * pas un compteur d'orphelines affiché au fournil.
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

/**
 * **Qui appeler** en livrant. Le livreur sonne à une porte : il lui faut un nom
 * et un numéro, pas une raison sociale.
 *
 * Trois provenances, dans cet ordre — c'est la seule information de la fiche qui
 * se cherche ailleurs que sur la commande :
 *
 * - `address` — le contact **de l'adresse** (carnet de la société). Le bon ;
 * - `holder` — à défaut, le **détenteur du compte** (le membre `owner`). Il n'a
 *   pas forcément été prévenu, mais c'est quelqu'un à qui parler ;
 * - `null` — l'adresse a été dictée à la volée et le compte n'a pas de
 *   détenteur. La fiche le **dit** alors : le livreur doit savoir qu'il part
 *   sans numéro, pas le découvrir devant la porte.
 */
export interface ProductionContact {
  readonly source: "address" | "holder";
  readonly name: string;
  /** Peut être vide : un détenteur sans téléphone reste un nom à demander. */
  readonly phone: string;
}

/** Une fiche : une commande, telle qu'on la fabrique et telle qu'on la remet. */
export interface ProductionSheet {
  readonly orderId: string;
  readonly orderNumber: string;
  /**
   * Le nom **commercial** — l'enseigne. C'est celui que le fournil connaît et
   * celui qui est peint sur la devanture. Vide quand la société n'en a pas
   * déclaré, ou quand la commande est personnelle.
   */
  readonly tradeName: string;
  /**
   * La **raison sociale** — le nom au greffe. Il lève l'ambiguïté entre deux
   * enseignes voisines, et c'est lui qui figure sur les papiers.
   *
   * Sur une commande **sans entreprise** (zéro friction), c'est la personne :
   * l'enseigne est vide et ce champ porte seul le nom. Une fiche a toujours
   * quelqu'un à qui remettre, même quand ce n'est pas une société.
   */
  readonly legalName: string;
  readonly fulfillmentMethod: FulfillmentMethod;
  /** Le point de retrait nommé, quand c'est un retrait et qu'il en porte un. */
  readonly pickupLabel: string | null;
  /**
   * L'adresse **postale** du point de retrait — celle qu'on lit au téléphone à
   * un client qui demande où venir. Le libellé seul ne suffit pas.
   */
  readonly pickupAddress: BillingAddressPayload | null;
  /** L'adresse servie, quand c'est un coursier. */
  readonly deliveryAddress: BillingAddressPayload | null;
  /** Qui appeler en livrant — cf. {@link ProductionContact}. `null` = personne. */
  readonly deliveryContact: ProductionContact | null;
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
}
