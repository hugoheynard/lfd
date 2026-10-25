import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";

/** Nom stable du fait durable — irréversible en production (plan A1, § 3). */
export const PRODUCTION_ORDER_WITHDRAWN_AFTER_CLOSE = "production.order_withdrawn_after_close";

/** Le type du fait journalisé ; le sujet est la journée, comme les autres faits du jour. */
const JOURNAL_TYPE = "production_day.order_withdrawn" satisfies JournalFactType;

/**
 * **Une commande inscrite est retirée de la journée** (plan A1,
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * § 2.1 et § 3 ; C7 § 3.5) — annulée après l'arrêt du plan, sous
 * l'autorisation `before_packing`. Le compte à produire et les fournées ne
 * bougent pas : ce fait est ce qui l'explique au journal.
 *
 * Publié par le guichet du fournil sous le verrou de la journée, dans la
 * transaction de l'annulation : si elle échoue ensuite, il disparaît avec
 * elle. Deux formes :
 *
 * - **durable** (`production.order_withdrawn_after_close`) — jour, commande.
 *   AUCUN abonné (§ 3). Clé `…:<serviceDay>:<orderId>` : une commande ne se
 *   retire qu'une fois d'une journée ;
 * - **journalisé** (`production_day.order_withdrawn`) — la journée, et la
 *   commande sous la référence figée au plan, `null` si le plan ne la porte
 *   plus.
 */
export class OrderWithdrawnAfterCloseEvent implements JournaledEvent, DurableEvent {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly orderId: string,
    readonly reference: string | null,
    readonly withdrawnAt: Date,
  ) {}

  journalFact(): JournalFact {
    return {
      type: JOURNAL_TYPE,
      subjectType: "production_day",
      subjectId: this.serviceDay,
      payload: {
        subjectLabel: this.serviceDay,
        serviceDay: this.serviceDay,
        orderId: this.orderId,
        orderNumber: this.reference,
      },
    };
  }

  durableFact(): DurableFact {
    return {
      type: PRODUCTION_ORDER_WITHDRAWN_AFTER_CLOSE,
      key: `${PRODUCTION_ORDER_WITHDRAWN_AFTER_CLOSE}:${this.serviceDay}:${this.orderId}`,
      payload: {
        serviceDay: this.serviceDay,
        orderId: this.orderId,
        withdrawnAt: this.withdrawnAt.toISOString(),
      },
    };
  }
}
