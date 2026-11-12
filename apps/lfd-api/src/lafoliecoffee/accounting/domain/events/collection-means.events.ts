import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { NamedPayer } from "../entities/payer-billing-mode-history.js";
import type { PayerMeansChange } from "../entities/payer-collection-means-history.js";
import { ACCOUNTING_FACTS } from "./accounting-facts.js";
import type { LegalEntitySubject } from "./legal-entity.events.js";

/**
 * Le moyen d'encaissement d'un payeur a été programmé, posé immédiatement
 * (daté de la dernière clôture passée), ou un programmé annulé (V10). Sujet :
 * le payeur — sa fiche le raconte ; l'entité est citée par son nom.
 */
export class PayerCollectionMeansChangedEvent implements JournaledEvent {
  constructor(
    readonly payer: NamedPayer,
    readonly entity: LegalEntitySubject,
    readonly at: Date,
    readonly change: PayerMeansChange,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNTING_FACTS.payerCollectionMeansChanged,
      subjectType: "company",
      subjectId: this.payer.id,
      occurredAt: this.at,
      payload: {
        subjectLabel: this.payer.name,
        legalEntity: { id: this.entity.id, name: this.entity.name },
        from: this.change.from,
        to: this.change.to,
        effectiveAt: this.change.effectiveAt.toISOString(),
        cancelled: this.change.kind === "cancelled",
        immediate: this.change.immediate,
        reason: this.change.reason,
      },
    };
  }
}
