import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { OrderCutoffSettingsState } from "./order-cutoff-settings.js";

/**
 * **Le fait de l'interrupteur de l'heure limite générale** (lot O3).
 *
 * Désactiver la règle laisse passer d'un coup toute commande tardive : la
 * réclamation qui suit demande « depuis quand, et qui ». Rangé sous
 * `commandes` dans `activity-module.ts`.
 */
export const ORDER_CUTOFF_SETTINGS_FACTS = {
  updated: "order_cutoff_settings.updated",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Le sujet du fait : il n'y a qu'un réglage. */
export const ORDER_CUTOFF_SETTINGS_SUBJECT = "orders";

/** La charge dit l'état posé ET l'état remplacé. */
export class OrderCutoffSettingsUpdatedEvent implements JournaledEvent {
  constructor(
    readonly next: OrderCutoffSettingsState,
    readonly previous: OrderCutoffSettingsState,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ORDER_CUTOFF_SETTINGS_FACTS.updated,
      subjectType: "order_cutoff_settings",
      subjectId: ORDER_CUTOFF_SETTINGS_SUBJECT,
      payload: {
        enabled: this.next.enabled,
        sameDayAllowed: this.next.sameDayAllowed,
        previous: {
          enabled: this.previous.enabled,
          sameDayAllowed: this.previous.sameDayAllowed,
        },
      },
    };
  }
}
