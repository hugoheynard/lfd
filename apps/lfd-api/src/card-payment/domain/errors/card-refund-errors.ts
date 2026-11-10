import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

/** Une demande de remboursement mal formée — faute de l'appelant (le sujet), jamais d'un client. */
export class CardRefundRequestInvalidError extends DomainError {
  constructor(detail: string) {
    super("card_payment.refund_request.invalid", `Demande de remboursement refusée : ${detail}.`);
  }
}

/** Aucune demande de remboursement sous cet identifiant. */
export class CardRefundRequestNotFoundError extends ResourceNotFoundError {
  constructor(requestId: string) {
    super(
      "card_payment.refund_request.not_found",
      `Aucune demande de remboursement « ${requestId} ». Rouvrez la commande : la liste des ` +
        "demandes a peut-être changé.",
    );
  }
}

/** Une transition hors de la machine du §3.4 — le refus du déclencheur, porté d'abord ici. */
export class CardRefundTransitionRefusedError extends BusinessError {
  constructor(requestId: string, from: string, to: string) {
    super(
      "card_payment.refund_request.transition_refused",
      `La demande de remboursement ${requestId} ne passe pas de « ${from} » à « ${to} » : ` +
        "une demande arrêtée se relance ou se dit rendue autrement.",
    );
  }
}

/** Le prestataire rend un autre `re_…` que celui déjà posé pour la génération. */
export class CardRefundAlreadyIssuedError extends BusinessError {
  constructor(requestId: string) {
    super(
      "card_payment.refund_request.already_issued",
      `La demande de remboursement ${requestId} porte déjà un autre remboursement chez le ` +
        "prestataire : vérifiez le paiement dans son tableau de bord avant de relancer.",
    );
  }
}

/**
 * Pourquoi « Relancer » est refusé (§3.4). Chaque motif a sa phrase : elle
 * est lue au back-office, sans le code sous les yeux.
 */
export type CardRefundRetryRefusal =
  | "in_progress"
  | "awaiting_bank"
  | "refunded"
  | "settled_elsewhere"
  | "never_attempted"
  | "another_in_progress";

const RETRY_MESSAGES: Readonly<Record<CardRefundRetryRefusal, string>> = {
  in_progress:
    "Le remboursement est en cours d'envoi au prestataire : attendez une minute, puis rouvrez la commande.",
  awaiting_bank:
    "Le remboursement est émis et attend la banque : rien à relancer tant qu'elle n'a pas répondu.",
  refunded: "Le remboursement est déjà rendu : rien à relancer.",
  settled_elsewhere: "Le remboursement a été rendu autrement : rien à relancer.",
  never_attempted:
    "Le remboursement n'a pas encore été tenté : il part tout seul à son échéance, rien à relancer.",
  another_in_progress:
    "Un autre remboursement du même paiement est déjà en cours : attendez qu'il aboutisse.",
};

/** « Relancer » refusé — un 409 qui dit pourquoi, et quoi faire. */
export class CardRefundRetryRefusedError extends BusinessError {
  constructor(readonly reason: CardRefundRetryRefusal) {
    super(`card_payment.refund_request.retry_${reason}`, RETRY_MESSAGES[reason]);
  }
}

/** « Rendu autrement » refusé : seule une demande arrêtée se constate rendue hors plateforme. */
export class CardRefundNotStoppedError extends BusinessError {
  constructor(requestId: string, state: string) {
    super(
      "card_payment.refund_request.not_stopped",
      `La demande de remboursement ${requestId} est « ${state} » : seule une demande arrêtée ` +
        "se dit rendue autrement. Si elle est en cours, attendez son issue.",
    );
  }
}

/** Il ne reste rien à rendre sur ce paiement : aucune demande n'est créée. */
export class CardRefundNothingLeftError extends BusinessError {
  constructor(paymentId: string) {
    super(
      "card_payment.refund.nothing_left",
      `Il ne reste rien à rembourser sur le paiement ${paymentId} : tout est déjà rendu ou ` +
        "annoncé. Vérifiez les demandes en cours de la commande.",
    );
  }
}

/** Un montant demandé au-delà de ce qui reste à rendre (§3.5, G2). */
export class CardRefundAmountExceedsRemainderError extends BusinessError {
  constructor(amountCents: number, remainderCents: number) {
    super(
      "card_payment.refund.amount_exceeds_remainder",
      `Remboursement de ${String(amountCents)} centimes refusé : il ne reste que ` +
        `${String(remainderCents)} centimes à rendre sur ce paiement.`,
    );
  }
}

/** Un paiement qui n'est pas encaissé ne se rembourse pas. */
export class CardRefundPaymentNotPaidError extends BusinessError {
  constructor(paymentId: string, state: string) {
    super(
      "card_payment.refund.payment_not_paid",
      `Le paiement ${paymentId} est « ${state} » : il n'a pas été encaissé, il n'y a rien à ` +
        "rembourser. S'il doit l'être, annulez-le plutôt.",
    );
  }
}

/**
 * Pourquoi un remboursement constaté n'est PAS écrit au carnet — les quatre
 * motifs de `RefundRejectedError` d'`orders` (vérifié le 2026-11-10), que le
 * fait `order.refund_rejected` exige tels quels.
 */
export type CardRefundRejection =
  "currency" | "exceeds_charge" | "amount_changed" | "reversed_after_success";

/**
 * Un remboursement que le carnet refuse d'écrire. **Jamais renvoyé au
 * prestataire** : le webhook répond 200, le refus va au canal (le sujet le
 * journalise et sonne) — un réessai ne le rendrait pas plus vrai.
 */
export class CardRefundRejectedError extends BusinessError {
  constructor(readonly reason: CardRefundRejection) {
    super(
      `card_payment.refund.${reason}`,
      `Remboursement non noté au carnet (${reason}) : comparez avec le tableau de bord du prestataire.`,
    );
  }
}

/**
 * L'écriture conditionnée d'une demande n'a pas franchi : un autre exécuteur
 * a pris la génération ou le bail. 500 : rien n'est écrit, le balayage reprend.
 */
export class CardRefundRequestConflictError extends TechnicalError {
  constructor(requestId: string) {
    super(
      "card_payment.refund_request.conflict",
      `La demande de remboursement ${requestId} a changé pendant l'écriture : rien n'a été ` +
        "écrit, le balayage la reprendra.",
    );
  }
}
