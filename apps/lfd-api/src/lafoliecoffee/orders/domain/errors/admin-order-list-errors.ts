import { DomainError } from "../../../../platform/shared/errors/app-error.js";

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
