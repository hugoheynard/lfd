import {
  CancellationReasonRequiredError,
  CancellationReasonTooLongError,
} from "../errors/order-cancellation-errors.js";

/** Assez pour une phrase d'explication, pas pour une lettre. */
export const CANCELLATION_REASON_MAX_LENGTH = 500;

/**
 * **Pourquoi l'équipe annule** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.5) : obligatoire,
 * borné, jamais montré au client — il va au journal et sur la commande.
 *
 * Le contrôleur ne valide que la forme (une chaîne) ; c'est ici que le vide
 * et l'excès sont refusés, avec une phrase.
 */
export class CancellationReason {
  private constructor(readonly value: string) {}

  /**
   * @throws {CancellationReasonRequiredError} vide, ou seulement des espaces.
   * @throws {CancellationReasonTooLongError} plus de 500 caractères.
   */
  static of(raw: string): CancellationReason {
    const value = raw.trim();
    if (value === "") {
      throw new CancellationReasonRequiredError();
    }
    if (value.length > CANCELLATION_REASON_MAX_LENGTH) {
      throw new CancellationReasonTooLongError(CANCELLATION_REASON_MAX_LENGTH);
    }
    return new CancellationReason(value);
  }
}
