import type { FulfillmentMethod, OrderStatus } from "@lfd/contracts";

import type { HandoverQueueWindow } from "./order.reader.js";

/**
 * Une commande vue par la Supervision : de quoi la situer et la nommer, rien de
 * plus. Aucun montant, aucun contact.
 */
export interface SupervisedOrder {
  readonly orderId: string;
  readonly reference: string;
  /** La société, sinon la personne — le NOM seul, jamais un e-mail. `null` si inconnu. */
  readonly customerName: string | null;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly status: OrderStatus;
  /** Le créneau convenu et sa provenance, `null` s'il n'y en a pas. */
  readonly window: HandoverQueueWindow | null;
}

/**
 * Port de **lecture** de la Supervision du jour
 * (`documentation/order/plan-supervision-du-jour.md`).
 *
 * Étroit exprès, et séparé d'`OrderReader` : la vue n'en appelle rien d'autre,
 * et ses doublés de test n'ont pas à jouer les verbes qu'elle n'appelle pas.
 * Cross-tenant par nature — toute la journée, toutes sociétés —, gardé en amont
 * par `@AdminSurface("b2b_supervision")`.
 *
 * Les deux lectures appliquent le même filtre d'argent que le dossier du jour :
 * la vue supervise ce qu'on fabrique, ni plus ni moins.
 */
export abstract class DaySupervisionReader {
  /** Les commandes d'une date de service (`AAAA-MM-JJ`), brouillons exclus, par numéro. */
  abstract ordersOn(day: string): Promise<readonly SupervisedOrder[]>;

  /** Le nombre de commandes OUVERTES sans date de service — ni brouillon, ni retirée, ni annulée. */
  abstract countUndated(): Promise<number>;
}
