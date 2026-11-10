import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { OrderOpening, OrderOpeningState } from "./order-opening.js";

/**
 * **Le fait du réglage d'ouverture de la boutique.**
 *
 * Fermer la boutique à une clientèle refuse d'un coup toutes ses commandes, et
 * la réclamation qui suit demande « depuis quand, et qui ». Le préfixe
 * `order_opening.` est rangé sous `commandes` dans `activity-module.ts`.
 */
export const ORDER_OPENING_FACTS = {
  updated: "order_opening.updated",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Le sujet du fait : il n'y a qu'un réglage. */
export const ORDER_OPENING_SUBJECT = "orders";

/** La charge dit l'état posé ET l'état remplacé : un geste ne change qu'un champ. */
export class OrderOpeningUpdatedEvent implements JournaledEvent {
  constructor(
    readonly settings: OrderOpening,
    readonly previous: OrderOpeningState,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ORDER_OPENING_FACTS.updated,
      subjectType: "order_opening",
      subjectId: ORDER_OPENING_SUBJECT,
      payload: {
        ordersOpenToB2b: this.settings.ordersOpenToB2b,
        ordersOpenToB2c: this.settings.ordersOpenToB2c,
        firstServiceDayB2b: this.settings.firstServiceDayB2b,
        firstServiceDayB2c: this.settings.firstServiceDayB2c,
        previous: {
          ordersOpenToB2b: this.previous.ordersOpenToB2b,
          ordersOpenToB2c: this.previous.ordersOpenToB2c,
          firstServiceDayB2b: this.previous.firstServiceDayB2b,
          firstServiceDayB2c: this.previous.firstServiceDayB2c,
        },
      },
    };
  }
}
