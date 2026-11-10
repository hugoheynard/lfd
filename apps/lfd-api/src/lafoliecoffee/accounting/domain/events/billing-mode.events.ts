import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { ModeDatesChange } from "../entities/billing-mode-dates-history.js";
import type { NamedPayer, PayerModeChange } from "../entities/payer-billing-mode-history.js";
import { ACCOUNTING_FACTS } from "./accounting-facts.js";
import type { LegalEntitySubject } from "./legal-entity.events.js";

/**
 * Les dates d'un mode ont été programmées, ou un programmé annulé (plan
 * `plan-rythme-de-facturation.md`, §16.6-7).
 *
 * **L'avant, l'après ET la prise d'effet** au payload : les dates ne changent
 * jamais à l'instant du geste, mais à la prochaine clôture du mode. Annulé :
 * `from` est ce qui avait été programmé, `to` ce qui reste en vigueur.
 */
export class BillingModeDatesChangedEvent implements JournaledEvent {
  constructor(
    readonly entity: LegalEntitySubject,
    readonly at: Date,
    readonly change: ModeDatesChange,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNTING_FACTS.billingModeDatesChanged,
      subjectType: "legal_entity",
      subjectId: this.entity.id,
      occurredAt: this.at,
      payload: {
        subjectLabel: this.entity.name,
        mode: this.change.mode,
        from: [...this.change.from.days],
        to: [...this.change.to.days],
        effectiveAt: this.change.effectiveAt.toISOString(),
        cancelled: this.change.kind === "cancelled",
      },
    };
  }
}

/**
 * Le mode d'un payeur a été programmé, ou un programmé annulé (§16.6-7). Sujet :
 * le payeur — c'est sa fiche qui le raconte ; l'entité est citée par son nom.
 */
export class PayerBillingModeChangedEvent implements JournaledEvent {
  constructor(
    readonly payer: NamedPayer,
    readonly entity: LegalEntitySubject,
    readonly at: Date,
    readonly change: PayerModeChange,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNTING_FACTS.payerBillingModeChanged,
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
      },
    };
  }
}
