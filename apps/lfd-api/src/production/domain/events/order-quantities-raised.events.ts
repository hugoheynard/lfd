import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import type { RaisedLine } from "../entities/production-day.revision.js";

/** Nom stable du fait durable — irréversible en production (plan A2, § 7). */
export const PRODUCTION_ORDER_QUANTITIES_RAISED = "production.order_quantities_raised";

/** Le type du fait journalisé ; le sujet est la journée, comme le retrait (A1). */
const JOURNAL_TYPE = "production_day.order_quantities_raised" satisfies JournalFactType;

/**
 * **Une commande inscrite demande plus au four** (plan A2,
 * `documentation/commandes/modification/plan-a2-modifier-une-commande-inscrite.md`,
 * § 2.1 et § 7) — l'équipe a monté des quantités après l'arrêt du plan ; le
 * compte du jour monte d'autant, et c'est ce fait qui dit pourquoi
 * (« +2 baguettes, ORD-… »). Une baisse ne publie rien : le compte ne baisse
 * pas.
 *
 * Publié par le guichet du fournil sous le verrou de la journée, dans la
 * transaction de la révision. Deux formes :
 *
 * - **durable** (`production.order_quantities_raised`) — AUCUN abonné. Clé
 *   `…:<serviceDay>:<orderId>:r<revision>` : une révision ne monte qu'une fois ;
 * - **journalisé** (`production_day.order_quantities_raised`) — la journée,
 *   la commande sous sa référence figée au plan, et les lignes de → à.
 */
export class OrderQuantitiesRaisedEvent implements JournaledEvent, DurableEvent {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly orderId: string,
    readonly reference: string,
    readonly revision: number,
    readonly raised: readonly RaisedLine[],
    readonly raisedAt: Date,
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
        lines: this.raised.map((line) => ({ ...line })),
      },
    };
  }

  durableFact(): DurableFact {
    return {
      type: PRODUCTION_ORDER_QUANTITIES_RAISED,
      key: `${PRODUCTION_ORDER_QUANTITIES_RAISED}:${this.serviceDay}:${this.orderId}:r${String(this.revision)}`,
      payload: {
        serviceDay: this.serviceDay,
        orderId: this.orderId,
        revision: this.revision,
        raisedAt: this.raisedAt.toISOString(),
        lines: this.raised.map((line) => ({ ...line })),
      },
    };
  }
}
