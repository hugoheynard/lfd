import { DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus des **tranches de production** (Réglages › Production, plan
 * `documentation/fournil/plan-tranches-de-production.md`, §4). Lus par qui
 * règle l'écran : chacun nomme le cas et ce qu'il faut faire.
 */

/** Une heure fixe qui n'est pas `HH:mm` sur 24 h. */
export class InvalidTrancheTimeError extends DomainError {
  constructor(raw: string) {
    super(
      "production.tranches.invalid_time",
      `La tranche « ${raw} » n'est pas une heure : saisissez-la au format HH:mm, entre 00:00 et 23:59.`,
    );
  }
}

/** La même heure deux fois. */
export class DuplicateTrancheError extends DomainError {
  constructor(time: string) {
    super(
      "production.tranches.duplicate",
      `La tranche ${time} est saisie deux fois : retirez l'une des deux lignes, puis enregistrez.`,
    );
  }
}

/** Plus d'heures que la borne. */
export class TooManyTranchesError extends DomainError {
  constructor(count: number, max: number) {
    super(
      "production.tranches.too_many",
      `${count} tranches fixes sont saisies, au plus ${max} sont admises : retirez-en ${count - max} avant d'enregistrer.`,
    );
  }
}

/** Un mode inconnu — ni fixe, ni calculé. */
export class UnknownTrancheModeError extends DomainError {
  constructor(raw: string) {
    super(
      "production.tranches.unknown_mode",
      `Le mode de tranches « ${raw} » n'existe pas : choisissez « Fixes » ou « Calculées ».`,
    );
  }
}
