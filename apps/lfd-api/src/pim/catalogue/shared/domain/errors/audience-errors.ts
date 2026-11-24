import { DomainError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * L'audience n'est pas l'une des quatre. 400 — une ligne relue de travers
 * aussi : la base a son `CHECK`, mais un refus nommé vaut mieux qu'une valeur
 * inconnue qui circulerait jusqu'à l'émission.
 */
export class InvalidAudienceError extends DomainError {
  constructor(readonly audience: string) {
    super(
      "catalogue.audience.invalid",
      `« ${audience} » n'est pas une clientèle : choisir professionnels (pro), ` +
        `particuliers (public), les deux (both) ou le réassort des boutiques seulement (resupply).`,
    );
  }
}
