import type { OccurrenceRefusalCause } from "../../domain/ports/occurrence-run.ledger.js";

/** Le balayage du planificateur : sert les échéances dues des paniers pros. */
export class SweepRecurringOccurrencesCommand {}

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
  readonly subscriptions: number;
  readonly armed: number;
  readonly generated: number;
  readonly refused: number;
  readonly missed: number;
  /** Les échéances qu'une erreur technique a interrompues : réessayées au prochain passage. */
  readonly failed: number;
  readonly alerts: readonly RecurringOccurrenceAlert[];
}
