import { DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus des **réglages du fournil** — les jours fermés, et la forme d'une
 * heure (plan `documentation/production/arret-du-plan.md`). Les refus du mode
 * et des heures d'arrêt sont partis avec eux le 2026-10-21.
 *
 * Lus par qui règle l'écran, sans le code sous les yeux : chacun nomme le cas
 * et ce qu'il faut faire.
 */

/** Ce que l'heure règle — dit dans le message. */
export type HouseTimeRole = "close" | "alert";

const ROLE_WORDS: Readonly<Record<HouseTimeRole, string>> = {
  close: "L'heure d'arrêt automatique",
  alert: "L'heure d'alerte",
};

/** Une heure qui n'est pas `HH:MM` sur 24 h. */
export class InvalidHouseTimeError extends DomainError {
  constructor(role: HouseTimeRole, raw: string) {
    super(
      "production.settings.invalid_time",
      `${ROLE_WORDS[role]} « ${raw} » n'est pas une heure : saisissez-la au format HH:MM, entre 00:00 et 23:59.`,
    );
  }
}

/** Un jour fermé posé sur une date passée. */
export class PastClosedDayError extends DomainError {
  constructor(serviceDay: string, today: string) {
    super(
      "production.settings.closed_day_in_past",
      `Le ${serviceDay} est passé (nous sommes le ${today}) : un jour fermé se pose sur aujourd'hui ou une date à venir.`,
    );
  }
}
