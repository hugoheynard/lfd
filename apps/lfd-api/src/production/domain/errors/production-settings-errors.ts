import { DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus des **réglages du fournil** — les jours fermés (plan
 * `documentation/fournil/arret-du-plan.md`). La forme d'une heure est refusée
 * au noyau (`house-time-errors.ts`).
 *
 * Lus par qui règle l'écran, sans le code sous les yeux : chacun nomme le cas
 * et ce qu'il faut faire.
 */

/** Un jour fermé posé sur une date passée. */
export class PastClosedDayError extends DomainError {
  constructor(serviceDay: string, today: string) {
    super(
      "production.settings.closed_day_in_past",
      `Le ${serviceDay} est passé (nous sommes le ${today}) : un jour fermé se pose sur aujourd'hui ou une date à venir.`,
    );
  }
}
