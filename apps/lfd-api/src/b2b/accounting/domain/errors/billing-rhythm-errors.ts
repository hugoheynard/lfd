import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Un rythme de facturation mal formé : jour hors bornes, deux clôtures le même
 * jour, ou une forme relue qui ne correspond à aucun rythme connu.
 *
 * Le message est lu par la comptabilité au moment de régler l'entité : il dit
 * ce qui a été reçu et ce qui est attendu.
 */
export class InvalidBillingRhythmError extends DomainError {
  constructor(readonly reason: string) {
    super("accounting.billing_rhythm.invalid", `Rythme de facturation refusé : ${reason}`);
  }
}
