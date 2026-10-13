import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de la **demande de remboursement** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, lot C4). Les phrases
 * parlent à l'équipe : elles nomment le cas et le geste de sortie.
 */

/** Une demande ne promet jamais zéro : rien à rendre, pas de demande (C4.4). */
export class RefundRequestAmountError extends DomainError {
  constructor(readonly announcedCents: number) {
    super(
      "orders.refund_request.amount",
      `Un remboursement se demande pour un montant positif en centimes (reçu : ${String(announcedCents)}).`,
    );
  }
}

/** Le `re_…` de la génération est déjà posé, et c'en est un autre. */
export class RefundRequestAlreadyIssuedError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.refund_request.already_issued",
      "Un autre remboursement Stripe est déjà rattaché à cette demande : rien n'a été réécrit. " +
        "Comparez la commande et ses remboursements dans le tableau de bord Stripe.",
    );
  }
}

/** Ouvrir une génération n'a de sens que si la précédente a échoué chez Stripe. */
export class RefundRequestNotFailedError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.refund_request.not_failed",
      "Le remboursement en cours n'a pas échoué chez Stripe : il n'y a pas lieu d'en émettre un autre.",
    );
  }
}

/** « Relancer » sur une commande sans demande. */
export class RefundRequestNotFoundError extends ResourceNotFoundError {
  constructor(readonly orderId: string) {
    super(
      "orders.refund_request.not_found",
      "Aucun remboursement n'est demandé pour cette commande : il n'y a rien à relancer.",
    );
  }
}

/** « Relancer » sur un remboursement que le carnet dit rendu. */
export class RefundRequestAlreadyRefundedError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.refund_request.already_refunded",
      "Cette commande est déjà remboursée : il n'y a rien à relancer.",
    );
  }
}

/** « Relancer » pendant qu'un exécuteur tient le bail. */
export class RefundRequestInProgressError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.refund_request.in_progress",
      "Stripe traite déjà ce remboursement. Rechargez la commande dans quelques minutes.",
    );
  }
}

/** « Relancer » sur un remboursement émis, en attente de la banque. */
export class RefundRequestAwaitingBankError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.refund_request.awaiting_bank",
      "Le remboursement est déjà envoyé à Stripe et attend la banque : il n'y a rien à relancer.",
    );
  }
}

/**
 * L'écriture conditionnée n'a pas franchi : un autre exécuteur a repris la
 * demande (bail expiré) ou ouvert une génération entre la lecture et
 * l'écriture. Rejouable : le geste suivant relira.
 */
export class RefundRequestConflictError extends TechnicalError {
  constructor(readonly orderId: string) {
    super(
      "orders.refund_request.conflict",
      "La demande de remboursement a changé pendant l'écriture : rien n'a été écrit. Réessayez.",
    );
  }
}
