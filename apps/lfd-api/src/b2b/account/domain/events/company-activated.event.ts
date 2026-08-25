import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { ACCOUNT_FACTS } from "./account-facts.js";

/**
 * Fait de domaine : **une société est passée cliente** (`pending → active`) par
 * l'activation commerciale. C'est **le jalon de conversion** du module croissance.
 *
 * Il s'inscrit lui-même au journal (`publishTraced`), là où un abonné de
 * `growth` s'en chargeait après coup. Le geste est celui d'un agent sur le
 * compte d'un tiers : sa trace doit tomber avec lui si elle échoue, pas plus
 * tard et pas en silence.
 */
export class CompanyActivatedEvent implements JournaledEvent {
  constructor(
    readonly companyId: string,
    /** Instant d'activation (temps métier, issu du `Clock`). */
    readonly activatedAt: Date,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNT_FACTS.companyActivated,
      subjectType: "company",
      subjectId: this.companyId,
      occurredAt: this.activatedAt,
      payload: { activatedAt: this.activatedAt.toISOString() },
    };
  }
}
