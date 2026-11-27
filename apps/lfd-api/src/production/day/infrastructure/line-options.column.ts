import type { ProductionLineOption } from "../../channels/commerce/day-orders.reader.js";
import { lineOptionsOf } from "../../channels/payload-fields.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les options d'une ligne du plan, telles que la colonne `options` les garde
 * — le fournil les écrit lui-même, et la contrainte tient le tableau.
 */
export class StoredProductionLineOptionsUnreadableError extends TechnicalError {
  constructor(sku: string) {
    super(
      "production.line_options_unreadable",
      `Les options de l'article ${sku} au plan du fournil sont illisibles. La base a été modifiée ` +
        "hors du code : vérifiez la commande à l'écran avant de la fabriquer, et prévenez l'équipe technique.",
    );
  }
}

/**
 * Lit `production_order_line.options`. Refuse plutôt que de rendre `[]` :
 * relire « sans option » ferait sortir entier un pain demandé tranché.
 *
 * @throws {StoredProductionLineOptionsUnreadableError} forme hors du contrat.
 */
export function productionLineOptionsOf(
  sku: string,
  value: unknown,
): readonly ProductionLineOption[] {
  const options = lineOptionsOf(value);
  if (options === null) {
    throw new StoredProductionLineOptionsUnreadableError(sku);
  }
  return options;
}
