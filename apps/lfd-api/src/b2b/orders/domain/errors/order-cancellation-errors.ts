import {
  BusinessError,
  DomainError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";
import { cancellationRefusalOf, type CancellationBlock } from "../services/order-cancellation.js";

/**
 * Les refus de l'**annulation staff** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.7). Les phrases
 * parlent à l'équipe, pas au client : celles de l'abandon
 * (`order-abandon-errors.ts`) gardent leur sens et leurs mots.
 */

/** La règle refuse : déjà annulée, prête, retirée, au compte, payée, inscrite. */
export class OrderNotCancellableError extends BusinessError {
  constructor(
    readonly orderId: string,
    readonly block: CancellationBlock,
  ) {
    super(`orders.cancel.${block.kind}`, cancellationRefusalOf(block));
  }
}

/** Stripe dit `processing` : on ne ferme pas ce qui peut encore aboutir. */
export class OrderCancellationPaymentInProgressError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.cancel.payment_in_progress",
      "Un paiement par carte est en cours de traitement sur cette commande. Réessayez " +
        "dans quelques minutes : s'il aboutit, la commande sera payée.",
    );
  }
}

/** Stripe n'a pas répondu : rien n'a été fermé, la base n'est pas touchée. */
export class OrderCancellationProviderUnavailableError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.cancel.provider_unavailable",
      "Le prestataire de paiement ne répond pas : rien n'a été annulé. Réessayez dans un instant.",
    );
  }
}

/**
 * Le paiement est fermé chez Stripe, mais l'annulation n'a pas pu s'écrire —
 * deux fois de suite (C3.4 ter). Le staff relance : Stripe répondra
 * `already_cancelled`, et l'écriture se fera.
 */
export class OrderCancellationNotRecordedError extends TechnicalError {
  constructor(
    readonly orderId: string,
    cause: unknown,
  ) {
    super(
      "orders.cancel.not_recorded",
      "Le paiement est fermé chez Stripe, mais l'annulation n'a pas pu être enregistrée. " +
        "Relancez l'annulation.",
      cause,
    );
  }
}

/** Le motif est obligatoire. */
export class CancellationReasonRequiredError extends DomainError {
  constructor() {
    super("orders.cancel.reason_required", "Indiquez pourquoi la commande est annulée.");
  }
}

/** Le motif dépasse la borne. */
export class CancellationReasonTooLongError extends DomainError {
  constructor(readonly maxLength: number) {
    super(
      "orders.cancel.reason_too_long",
      `Le motif d'annulation tient en ${String(maxLength)} caractères au plus : raccourcissez-le.`,
    );
  }
}
