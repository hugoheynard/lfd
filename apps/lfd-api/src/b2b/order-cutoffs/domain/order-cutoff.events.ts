import type { OrderCutoffPayload } from "@lfd/contracts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";

/**
 * **Les faits des heures limites de commande.**
 *
 * Une heure limite décide à partir de quand une commande bascule au lendemain.
 * Quand un client réclame — « j'ai commandé à 17 h 02 et vous m'avez livré le
 * surlendemain » — la question est de savoir ce que la règle disait **ce
 * jour-là**, et qui l'avait posée. L'état courant ne le dira pas : il aura
 * peut-être changé depuis, précisément à cause de cette réclamation.
 *
 * La charge porte donc la règle entière : elle tient en quatre champs, et
 * chacun change la réponse.
 */
export const ORDER_CUTOFF_FACTS = {
  created: "order_cutoff.created",
  updated: "order_cutoff.updated",
  removed: "order_cutoff.removed",
} as const;

function ruleOf(payload: OrderCutoffPayload): Record<string, unknown> {
  return {
    // `null` n'est pas une absence ici : c'est « la règle par défaut de la
    // plateforme », et « tous les jours ». Le journal doit pouvoir les relire.
    pickupAddressId: payload.pickupAddressId,
    weekday: payload.weekday,
    daysBefore: payload.daysBefore,
    time: payload.time,
  };
}

export class OrderCutoffCreatedEvent implements JournaledEvent {
  constructor(
    readonly cutoffId: string,
    readonly payload: OrderCutoffPayload,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ORDER_CUTOFF_FACTS.created,
      subjectType: "order_cutoff",
      subjectId: this.cutoffId,
      payload: ruleOf(this.payload),
    };
  }
}

export class OrderCutoffUpdatedEvent implements JournaledEvent {
  constructor(
    readonly cutoffId: string,
    readonly payload: OrderCutoffPayload,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ORDER_CUTOFF_FACTS.updated,
      subjectType: "order_cutoff",
      subjectId: this.cutoffId,
      payload: ruleOf(this.payload),
    };
  }
}

export class OrderCutoffRemovedEvent implements JournaledEvent {
  constructor(readonly cutoffId: string) {}

  journalFact(): JournalFact {
    return {
      type: ORDER_CUTOFF_FACTS.removed,
      subjectType: "order_cutoff",
      subjectId: this.cutoffId,
      payload: {},
    };
  }
}
