import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

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
