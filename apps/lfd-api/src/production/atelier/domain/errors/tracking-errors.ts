import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Une marge hors bornes : elle se lit en minutes, et un palier ne s'attend pas des heures. */
export class InvalidTrackingMarginError extends DomainError {
  constructor(minutes: number, max: number) {
    super(
      "production.tracking_settings.invalid_margin",
      `La marge du suivi vaut ${String(minutes)} minutes : elle doit être un nombre entier de minutes entre 0 et ${String(max)}. Corrigez-la dans Réglages › Niveau de suivi.`,
    );
  }
}
