import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { BillingRhythm } from "../value-objects/billing-rhythm.js";
import type { BillingRhythmChange } from "../value-objects/billing-rhythm-setting.js";
import { ACCOUNTING_FACTS } from "./accounting-facts.js";
import type { LegalEntitySubject } from "./legal-entity.events.js";

/**
 * Le rythme de facturation de l'entité a été réglé (plan
 * `plan-rythme-de-facturation.md`, §2.3).
 *
 * **L'avant, l'après ET la prise d'effet** au payload : le rythme ne change
 * jamais à l'instant du geste, mais à la prochaine clôture de l'ancien — et
 * c'est ce fait seul qui dira, devant une facture, sous quel rythme sa période
 * avait été annoncée. `effectiveAt` nul : le réglage a annulé un programmé.
 */
export class BillingRhythmChangedEvent implements JournaledEvent {
  constructor(
    readonly entity: LegalEntitySubject,
    readonly at: Date,
    readonly change: BillingRhythmChange,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNTING_FACTS.billingRhythmChanged,
      subjectType: "legal_entity",
      subjectId: this.entity.id,
      occurredAt: this.at,
      payload: {
        subjectLabel: this.entity.name,
        from: rhythmPayload(this.change.from),
        to: rhythmPayload(this.change.to),
        effectiveAt: this.change.effectiveAt?.toISOString() ?? null,
      },
    };
  }
}

function rhythmPayload(rhythm: BillingRhythm): { kind: string; days: number[] } {
  return { kind: rhythm.kind, days: [...rhythm.days] };
}
