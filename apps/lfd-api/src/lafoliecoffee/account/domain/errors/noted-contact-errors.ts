import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Le jour d'un contact noté n'est pas un jour du calendrier (400) — un
 * 31 février passe le format sans exister.
 */
export class InvalidNotedContactDateError extends DomainError {
  constructor(readonly raw: string) {
    super(
      "account.noted_contact.invalid_date",
      `« ${raw} » n'est pas un jour du calendrier. Choisissez le jour de l'échange.`,
    );
  }
}

/**
 * Le contact est daté d'un jour qui n'est pas encore arrivé (400). On note un
 * échange qui a eu lieu ; un échange prévu est un rendez-vous.
 */
export class NotedContactInFutureError extends DomainError {
  constructor(
    readonly date: string,
    readonly today: string,
  ) {
    super(
      "account.noted_contact.in_future",
      `Le contact est daté du ${date}, après aujourd'hui (${today}). On ne note qu'un échange qui a eu lieu : choisissez son jour, ou prenez un rendez-vous.`,
    );
  }
}

/** La note dépasse la borne (400) : une phrase qu'on relit, pas un compte rendu. */
export class NotedContactNoteTooLongError extends DomainError {
  constructor(readonly maxLength: number) {
    super(
      "account.noted_contact.note_too_long",
      `La note d'un contact tient en ${maxLength} caractères au plus. Raccourcissez-la : le détail d'un échange a sa place dans les notes du commercial.`,
    );
  }
}
