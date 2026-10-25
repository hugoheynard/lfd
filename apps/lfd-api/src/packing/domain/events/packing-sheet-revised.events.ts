import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { RevisedDueLine } from "../services/revised-due.js";

/** Le type du fait journalisé — irréversible en production (plan A2, § 7). */
const JOURNAL_TYPE = "packing_sheet.revised" satisfies JournalFactType;

/**
 * **Les lignes dues d'une feuille sont révisées** (plan A2,
 * `documentation/commandes/modification/plan-a2-modifier-une-commande-inscrite.md`,
 * § 2.2) — l'équipe a changé les quantités d'une commande déjà inscrite.
 * Journalisé seulement, dans la transaction de la révision, et seulement
 * quand une ligne a changé. Le sujet est la commande, comme les contenants.
 */
export class PackingSheetRevisedEvent implements JournaledEvent {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly orderId: string,
    readonly reference: string,
    readonly lines: readonly RevisedDueLine[],
  ) {}

  journalFact(): JournalFact {
    return {
      type: JOURNAL_TYPE,
      subjectType: "order",
      subjectId: this.orderId,
      payload: {
        subjectLabel: this.reference,
        serviceDay: this.serviceDay,
        lines: this.lines.map((line) => ({ ...line })),
      },
    };
  }
}
