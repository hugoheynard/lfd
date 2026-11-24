import { DomainError } from "../../../platform/shared/errors/app-error.js";

/** Une heure d'arrivée qui n'est pas une heure `HH:MM` de la journée. */
export class InvalidResupplyArrivalTimeError extends DomainError {
  constructor(readonly value: string) {
    super(
      "resupply.arrival.invalid",
      `« ${value} » n'est pas une heure d'arrivée : écrivez-la en heures et minutes, de 00:00 à 23:59 (par exemple 06:30).`,
    );
  }
}

/** Un « pour demain » envoyé sans dire pour quelle heure il doit être là. */
export class ResupplyArrivalRequiredError extends DomainError {
  constructor() {
    super(
      "resupply.arrival.required",
      "Un réassort « pour demain » dit pour quelle heure il doit être au point : choisissez l'heure, puis envoyez-le.",
    );
  }
}

/** Un « au plus tôt » qui porte une heure : il part quand le fournil le lance. */
export class ResupplyArrivalOnAsapError extends DomainError {
  constructor() {
    super(
      "resupply.arrival.asap",
      "Un réassort « au plus tôt » ne porte pas d'heure : il part dès que le fournil le lance. Retirez l'heure, ou choisissez « pour demain ».",
    );
  }
}
