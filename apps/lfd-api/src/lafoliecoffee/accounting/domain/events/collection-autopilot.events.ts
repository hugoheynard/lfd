import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { SettledAutopilotOutcome } from "../ports/collection-autopilot-runs.js";
import { COLLECTION_FACT_TYPES } from "./accounting-facts.js";

/** L'entité dont l'automatisme a tenté le cycle, avec son nom du moment. */
export interface AutopilotEntity {
  readonly id: string;
  readonly name: string;
}

/** Ce qu'une tentative a donné. */
export interface AutopilotIssue {
  readonly outcome: SettledAutopilotOutcome;
  readonly batchCount: number;
  readonly message: string | null;
}

/**
 * **L'automatisme a tenté un cycle** (PA3). Le journal le dit, issue
 * comprise : un refus de l'automatisme ne doit pas se lire seulement dans une
 * table que personne n'ouvre. Les lots préparés ont, eux, leurs propres faits
 * (`collection.batch_constituted`, auteur système).
 */
export class CollectionAutopilotRanEvent implements JournaledEvent {
  constructor(
    readonly entity: AutopilotEntity,
    readonly cycleClosesAt: Date,
    readonly issue: AutopilotIssue,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return {
      type: COLLECTION_FACT_TYPES.autopilotRan,
      subjectType: "legal_entity",
      subjectId: this.entity.id,
      occurredAt: this.at,
      payload: {
        subjectLabel: this.entity.name,
        cycleClosesAt: this.cycleClosesAt.toISOString(),
        outcome: this.issue.outcome,
        batchCount: this.issue.batchCount,
        message: this.issue.message,
      },
    };
  }
}
