import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { LineStepState } from "../entities/line-step.js";

/**
 * **Les faits d'une étape** (
 * `documentation/fournil/un-produit-sur-plusieurs-postes.md`, § 2.3) : un
 * par geste qui change l'étape. La table ne garde que le dernier ; le journal
 * garde chacun.
 */
export const LINE_STEP_FACTS = {
  done: "production_line.step_done",
  red: "production_line.step_red",
  undone: "production_line.step_undone",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "production_line_step";

/** Ce que le fait nomme hors de l'étape, figé au geste. */
export interface StepLabels {
  readonly productName: string;
  readonly workstationName: string;
}

/** L'étape a changé : cochée, en rouge ou décochée — son statut le dit. */
export class LineStepChangedEvent implements JournaledEvent {
  constructor(
    readonly step: LineStepState,
    readonly labels: StepLabels,
  ) {}

  journalFact(): JournalFact {
    const common = {
      subjectLabel: this.labels.productName,
      serviceDay: this.step.serviceDay,
      sku: this.step.sku,
      workstationId: this.step.workstationId,
      workstationName: this.labels.workstationName,
      version: this.step.version,
    };
    return {
      type: LINE_STEP_FACTS[this.step.status],
      subjectType: SUBJECT_TYPE,
      subjectId: `${this.step.serviceDay}:${this.step.sku}:${this.step.workstationId}`,
      payload: this.step.status === "red" ? { ...common, reason: this.step.reason } : common,
    };
  }
}
