import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus propres au **bon de fidélité sur la commande** (plan des points,
 * lot C). Ceux qui tiennent à l'état du bon — déjà servi, expiré, inconnu —
 * sont levés par la fidélité, qui le possède.
 */

/**
 * Un bon nommé sur une commande passée pour une société — **400**. Au lot C,
 * seul un particulier connecté, qui commande pour lui-même, utilise un bon
 * (plan C3) ; l'ouverture aux pros est le lot F.
 */
export class VoucherNotForCompanyOrderError extends DomainError {
  constructor() {
    super(
      "orders.voucher_not_for_company_order",
      "Un bon de fidélité ne s'utilise pas sur une commande passée pour une société : " +
        "retirez le bon, ou commandez à titre personnel.",
    );
  }
}

/**
 * Un bon nommé dans un devis anonyme — **400**. Un bon appartient à une
 * personne : sans compte connecté, personne ne peut dire à qui il est.
 */
export class VoucherRequiresSignInError extends DomainError {
  constructor() {
    super(
      "orders.voucher_requires_sign_in",
      "Un bon de fidélité ne s'applique qu'une fois connecté : connectez-vous pour le voir déduit du total.",
    );
  }
}

/** Un bon d'une valeur impossible — **400**. La fidélité le garantit ; l'agrégat ne le croit pas. */
export class InvalidOrderVoucherError extends DomainError {
  constructor(valueCents: number) {
    super(
      "orders.invalid_voucher",
      `Bon de fidélité invalide (${String(valueCents)} centimes) : un bon vaut un nombre entier de centimes, au moins 1.`,
    );
  }
}
