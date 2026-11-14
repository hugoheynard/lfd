import { BusinessError, TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Le tableau du suivi commercial se calcule en mémoire sur toutes les fiches
 * du filtre (le niveau et les signaux ne se lisent pas en SQL) : au-delà de la
 * borne, la lecture est refusée plutôt que de coûter sans limite ou de rendre
 * des compteurs faux.
 */
export class SalesOversightTooLargeError extends BusinessError {
  constructor(readonly limit: number) {
    super(
      "growth.sales_oversight.too_large",
      `Le suivi commercial compte plus de ${limit} fiches pour ce filtre : choisissez un commercial ou un canal pour réduire la liste.`,
    );
  }
}

/** Le jour de Paris n'a pas pu être borné : un fuseau que la lecture ne sait pas lire. */
export class SalesDayUnreadableError extends TechnicalError {
  constructor(readonly day: string) {
    super(
      "growth.sales_oversight.day_unreadable",
      `Le récap du jour du suivi commercial n'a pas pu borner le ${day} à Paris : signalez-le à l'équipe technique.`,
    );
  }
}
