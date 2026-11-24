import type { OccurrenceRefusalCause } from "../../domain/refusal-cause.js";

/** Le balayage horaire : planifie à l'avance, puis passe les échéances dues. */
export class SweepDueOccurrencesCommand {}

/** Un refus dont la cause est nouvelle : ce que l'alerte staff dira. */
export interface RecurringOccurrenceAlert {
  readonly subscriptionId: string;
  readonly date: string;
  readonly cause: OccurrenceRefusalCause;
  readonly reason: string;
  readonly missed: boolean;
}

/** Ce que le balayage a fait, compté — la route de la machine le rend tel quel. */
export interface RecurringOccurrencesSweepReport {
  /** Les paniers dont la création à l'avance a avancé. */
  readonly planned: number;
  /** Les échéances créées à l'avance. */
  readonly created: number;
  /** Les échéances dues présentées au commerce. */
  readonly due: number;
  readonly placed: number;
  readonly refused: number;
  readonly missed: number;
  /** Les échéances qu'une erreur technique a interrompues : réessayées au prochain passage. */
  readonly failed: number;
  readonly alerts: readonly RecurringOccurrenceAlert[];
}
