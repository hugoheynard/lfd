import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Le premier jour commandable posé n'est pas un jour du calendrier (**400**) —
 * une forme autre que `AAAA-MM-JJ`, ou un jour qui n'existe pas (un 30 février).
 */
export class InvalidFirstServiceDayError extends DomainError {
  constructor(readonly raw: string) {
    super(
      "order_opening.invalid_first_service_day",
      `« ${raw} » n'est pas une date valide pour le premier jour commandable. Choisissez un jour dans le calendrier, ou « Aucune » pour ne rien restreindre.`,
    );
  }
}
