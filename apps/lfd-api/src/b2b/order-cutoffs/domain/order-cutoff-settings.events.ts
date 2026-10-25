import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { OrderCutoffSettingsState } from "./order-cutoff-settings.js";

/**
 * **Le fait du jour même** (§8.3). Il disait aussi l'interrupteur de l'heure
 * limite générale jusqu'au 2026-10-21 (retiré) ; les lignes d'avant gardent
 * `enabled`. Ouvrir le jour même change ce que la boutique propose : la
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
        sameDayAllowed: this.next.sameDayAllowed,
        resupplyCutoffTime: this.next.resupplyCutoffTime,
        pickupReminderDelayMinutes: this.next.pickupReminderDelayMinutes,
        delayWarningDelayMinutes: this.next.delayWarningDelayMinutes,
        previous: {
          sameDayAllowed: this.previous.sameDayAllowed,
          resupplyCutoffTime: this.previous.resupplyCutoffTime,
          pickupReminderDelayMinutes: this.previous.pickupReminderDelayMinutes,
          delayWarningDelayMinutes: this.previous.delayWarningDelayMinutes,
        },
      },
    };
  }
}
