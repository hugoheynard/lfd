import type { CustomerCancellationRefusal } from "@lfd/contracts";

import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";
import { CUSTOMER_REFUSAL_PHRASES } from "../services/customer-cancellation-refusal.js";

/**
 * Les refus de l'**annulation par le client** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C6.7).
 * Les phrases parlent à un CLIENT : elles ne citent ni le motif staff, ni une
 * autre commande par son numéro, ni le fournil comme acteur. Le code
 * `orders.customer_cancel.<refus>` est ce que le front lit.
 */

/** La règle, le réglage ou le prestataire refusent — `409`, avec la phrase client. */
export class CustomerCancellationRefusedError extends BusinessError {
  constructor(
    readonly refusal: CustomerCancellationRefusal,
    message: string = CUSTOMER_REFUSAL_PHRASES[refusal],
    cause?: unknown,
  ) {
    super(`orders.customer_cancel.${refusal}`, message, cause);
  }
}

/**
 * Le paiement est fermé chez Stripe mais l'annulation ne s'est pas écrite,
 * deux fois (C3.4 ter) — `500`, et la phrase du client : rien de plus n'a été
 * prélevé, réessayer.
 */
export class CustomerCancellationNotRecordedError extends TechnicalError {
  constructor(cause: unknown) {
    super("orders.customer_cancel.not_recorded", CUSTOMER_REFUSAL_PHRASES.not_recorded, cause);
  }
}

/** Un code de motif hors de la liste close. */
export class CustomerCancellationReasonCodeUnknownError extends DomainError {
  constructor() {
    super(
      "orders.customer_cancel.reason_unknown",
      "Ce motif d'annulation n'existe pas : choisissez-en un dans la liste, ou « Autre ».",
    );
  }
}

/** Le texte libre dépasse la borne. */
export class CustomerCancellationReasonTooLongError extends DomainError {
  constructor(readonly maxLength: number) {
    super(
      "orders.customer_cancel.reason_too_long",
      `Le motif tient en ${String(maxLength)} caractères au plus : raccourcissez-le.`,
    );
  }
}

/**
 * **Le lien d'annulation d'un invité ne mène nulle part** — jeton faux,
 * commande inconnue, commande qui n'est pas d'invité, ou lien de plus de
 * 90 jours (C6.4). UNE seule réponse pour tous ces cas : un curieux n'apprend
 * pas qu'une commande existe.
 */
export class GuestCancellationLinkNotFoundError extends ResourceNotFoundError {
  constructor() {
    super(
      "orders.customer_cancel.link_not_found",
      "Ce lien d'annulation est introuvable ou trop ancien. Contactez la boutique.",
    );
  }
}
