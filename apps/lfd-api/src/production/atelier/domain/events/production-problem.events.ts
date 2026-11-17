import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { ProductionProblemState } from "../entities/production-problem.js";
import type { OutputCorrection } from "../services/output-correction.js";

/**
 * **Les faits d'un problème du fournil** (
 * `documentation/fournil/les-niveaux-de-suivi.md`). La ligne
 * ne garde que le dernier rouge ; le journal garde chacun, avec les fournées
 * qu'il a corrigées — la trace de ce qui touche au facturé.
 */
export const PRODUCTION_PROBLEM_FACTS = {
  reported: "production_problem.reported",
  resolved: "production_problem.resolved",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "production_problem";

/** Ce que le rouge a fait des fournées de la ligne. */
export interface ProblemOutcome {
  /** Le nom du produit, figé au geste. */
  readonly productName: string;
  /** Ce que les fournées disaient sorti juste avant le rouge. */
  readonly output: number;
  readonly correction: OutputCorrection;
  /** Les pièces ajoutées par une fournée quand le rouge dit plus que sorti. */
  readonly declared: number;
}

/** Le rouge d'une ligne : posé, ou remplacé (la version le dit). */
export class ProductionProblemReportedEvent implements JournaledEvent {
  constructor(
    readonly problem: ProductionProblemState,
    readonly outcome: ProblemOutcome,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PRODUCTION_PROBLEM_FACTS.reported,
      subjectType: SUBJECT_TYPE,
      subjectId: this.problem.id,
      payload: {
        subjectLabel: this.outcome.productName,
        serviceDay: this.problem.serviceDay,
        sku: this.problem.sku,
        expected: this.problem.expected,
        output: this.outcome.output,
        produced: this.problem.produced,
        reason: this.problem.reason,
        version: this.problem.version,
        correctedBatches: this.outcome.correction.corrections.map((batch) => ({
          batchId: batch.batchId,
          corrected: batch.corrected,
        })),
        uncorrected: this.outcome.correction.uncorrected,
        declared: this.outcome.declared,
      },
    };
  }
}

/** Un responsable a marqué le problème traité. */
export class ProductionProblemResolvedEvent implements JournaledEvent {
  constructor(
    readonly problem: ProductionProblemState,
    readonly productName: string,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PRODUCTION_PROBLEM_FACTS.resolved,
      subjectType: SUBJECT_TYPE,
      subjectId: this.problem.id,
      payload: {
        subjectLabel: this.productName,
        serviceDay: this.problem.serviceDay,
        sku: this.problem.sku,
        produced: this.problem.produced,
        version: this.problem.version,
      },
    };
  }
}
