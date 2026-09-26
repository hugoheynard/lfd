import { AuthorizationError, BusinessError } from "../../../../platform/shared/errors/app-error.js";

/*
 * Les refus de l'abandon du règlement (plan
 * `documentation/order/plan-abandon-du-reglement.md`, §5). Rangés à part de
 * `order-errors.ts`, déjà au-delà des 300 lignes.
 *
 * ⚠️ Chacun est lu par un client qui vient de cliquer « Abandonner » : il dit
 * où en est sa commande, pas seulement que le geste a échoué.
 */

/**
 * Un membre de la société demande d'abandonner la commande qu'un collègue a
 * passée (Q2). 403 et non 404 : il la VOIT — la lecture reste ouverte à tout
 * membre —, il n'a simplement pas le droit de la détruire.
 */
export class OrderAbandonNotAuthorError extends AuthorizationError {
  constructor(readonly orderId: string) {
    super(
      "orders.abandon.not_author",
      "Seule la personne qui a passé cette commande peut l'abandonner. " +
        "Demandez-lui de le faire, ou contactez-nous.",
    );
  }
}

/** Ce qui rend une commande impossible à abandonner, lu de son état. */
export type AbandonRefusal = "already_paid" | "nothing_to_settle" | "already_in_production";

const REFUSAL_MESSAGES: Readonly<Record<AbandonRefusal, string>> = {
  already_paid:
    "Cette commande est déjà réglée : elle ne s'abandonne plus. " +
    "Contactez-nous si vous souhaitez l'annuler.",
  nothing_to_settle:
    "Cette commande n'attend aucun règlement par carte : il n'y a rien à abandonner.",
  already_in_production:
    "Cette commande est déjà en préparation : elle ne s'abandonne plus. Contactez-nous.",
};

/** L'état de la commande interdit l'abandon. 409 : elle existe et va bien. */
export class OrderNotAbandonableError extends BusinessError {
  constructor(readonly refusal: AbandonRefusal) {
    super("orders.abandon.not_abandonable", REFUSAL_MESSAGES[refusal]);
  }
}

/**
 * Stripe a déjà encaissé l'intention : la commande est payée, notre base ne le
 * sait pas encore — le webhook suit. On n'écrit rien (§5).
 */
export class OrderPaymentAlreadyReceivedError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.abandon.already_paid",
      "Le paiement de cette commande vient d'être reçu : elle n'est pas abandonnée. " +
        "Sa confirmation arrive dans quelques instants.",
    );
  }
}

/** Un paiement est en cours de traitement chez Stripe : on ne se prononce pas (§5). */
export class OrderPaymentInProgressError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.abandon.payment_in_progress",
      "Un paiement de cette commande est en cours de traitement : elle ne peut pas être " +
        "abandonnée maintenant. Réessayez dans quelques minutes.",
    );
  }
}

/**
 * Stripe n'a pas pu annuler l'intention. On n'écrit rien : annuler chez nous
 * une commande qu'une carte peut encore payer ferait encaisser une annulée.
 * La commande reste en attente, et la clôture de sa journée la balaiera (§5,
 * « Sortir quand Stripe est injoignable »).
 */
export class OrderAbandonUnavailableError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.abandon.provider_unavailable",
      "Nous n'avons pas pu annuler ce paiement pour le moment. Rien n'a été débité ; " +
        "la commande sera annulée d'elle-même si elle n'est pas réglée avant la fournée.",
    );
  }
}
