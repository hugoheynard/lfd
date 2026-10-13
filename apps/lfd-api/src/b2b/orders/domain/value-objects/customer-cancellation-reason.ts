import {
  CUSTOMER_CANCELLATION_REASON_CODES,
  CUSTOMER_CANCELLATION_REASON_MAX_LENGTH,
  type CustomerCancellationReasonCode,
} from "@lfd/contracts";

import {
  CustomerCancellationReasonCodeUnknownError,
  CustomerCancellationReasonTooLongError,
} from "../errors/customer-cancellation-errors.js";

/**
 * **Pourquoi le client annule** (plan, lot C6, Q-C6.1) : FACULTATIF — une
 * courte liste et un texte libre, jamais montré à un autre client. À l'inverse
 * de `CancellationReason` (staff), l'absence est admise : le noyau écrit alors
 * `NULL`.
 *
 * Ce qui part en base : `cancellation_reason_code` = le code choisi,
 * `cancellation_reason` = le texte libre s'il y en a un — sinon `NULL` (le
 * libellé d'un code se dit à la lecture, pas en copiant une phrase).
 */
export class CustomerCancellationReason {
  private constructor(
    readonly code: CustomerCancellationReasonCode | null,
    readonly text: string | null,
  ) {}

  /** Aucun motif — le cas courant. */
  static readonly none = new CustomerCancellationReason(null, null);

  /**
   * @throws {CustomerCancellationReasonCodeUnknownError} code hors de la liste.
   * @throws {CustomerCancellationReasonTooLongError} texte de plus de 500 caractères.
   */
  static of(rawCode: string | undefined, rawText: string | undefined): CustomerCancellationReason {
    const code = codeOf(rawCode);
    const trimmed = rawText?.trim() ?? "";
    if (trimmed.length > CUSTOMER_CANCELLATION_REASON_MAX_LENGTH) {
      throw new CustomerCancellationReasonTooLongError(CUSTOMER_CANCELLATION_REASON_MAX_LENGTH);
    }
    return new CustomerCancellationReason(code, trimmed === "" ? null : trimmed);
  }
}

function codeOf(raw: string | undefined): CustomerCancellationReasonCode | null {
  if (raw === undefined || raw.trim() === "") {
    return null;
  }
  const code = CUSTOMER_CANCELLATION_REASON_CODES.find((known) => known === raw.trim());
  if (code === undefined) {
    throw new CustomerCancellationReasonCodeUnknownError();
  }
  return code;
}
