import { AuthorizationError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Un `cursor` que le serveur n'a pas rendu, ou abîmé en route. */
export class InvalidAdminOrderCursorError extends DomainError {
  constructor() {
    super(
      "orders.admin_list.invalid_cursor",
      "Le curseur de pagination de la liste des commandes est illisible. " +
        "Recharger la liste depuis le début.",
    );
  }
}

/**
 * Un jour de filtre bien formé mais absent du calendrier (`2026-02-30`). Le
 * contrat ne vérifie que la forme ; c'est ici qu'on refuse, plutôt que de
 * glisser en silence au jour suivant.
 */
export class InvalidOrderListDayError extends DomainError {
  constructor(
    readonly field: string,
    readonly day: string,
  ) {
    super(
      "orders.admin_list.invalid_day",
      `Le jour « ${day} » du filtre ${field} n'existe pas au calendrier. ` +
        "Choisir une date existante.",
    );
  }
}

/**
 * L'onglet « À vérifier » demandé sans `b2b_order_review:read` : un 403, tenu
 * par le serveur et non par l'écran qui cache l'onglet.
 */
export class OrderReviewListNotReadableError extends AuthorizationError {
  constructor() {
    super(
      "orders.admin_list.to_review_forbidden",
      "L'onglet « À vérifier » demande le droit « Visa des commandes » en lecture. " +
        "Demandez-le à un administrateur (écran des rôles).",
    );
  }
}
