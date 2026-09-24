import {
  opensAt,
  type OperationAccess,
  type OperationClosed,
} from "../../../catalog/domain/operation-access.js";
import type { BusinessError } from "../../../../platform/shared/errors/app-error.js";
import {
  OperationArticleUnavailableError,
  OperationClosedError,
  OperationDayOutsideError,
  OperationDayRequiredError,
  OperationNotYetOpenError,
} from "../errors/order-operation-errors.js";

/** Une ligne du panier et sa réponse de D4, calculée par l'appelant avec l'horloge du serveur. */
export interface LineOperationAccess {
  /** Le SKU tel que la commande le porte (celui du produit). */
  readonly sku: string;
  readonly productName: string;
  readonly access: OperationAccess;
}

/**
 * **Refuse ce qu'une opération datée ne laisse pas commander** (D6 de
 * `documentation/order/architecture-operations-datees.md`).
 *
 * Fonction pure, sœur de `ensureWithinOrderCutoff`, appelée APRÈS lui dans
 * `OrderDrafting` : les deux s'appliquent, et c'est le plus tôt qui ferme —
 * aucun ne relâche l'autre.
 *
 * 🔴 **Aucune dérogation n'entre ici.** Celle de l'équipe n'ouvre que la grâce
 * du délai de fabrication ; elle ne couvre pas la clôture d'une opération
 * (décidé par Hugo). Ce n'est pas vérifié, c'est inexprimable : la fonction ne
 * la reçoit pas.
 *
 * Un article courant (`free`) passe toujours : les dates d'une opération ne
 * contraignent pas le croissant du 26 décembre (D3). `shown` passe aussi —
 * c'est la réponse d'une question sans jour, celle du devis.
 *
 * Le panier ne se découpe pas : la première ligne refusée refuse tout, et son
 * message dit laquelle.
 *
 * @throws {OperationArticleUnavailableError} aucune opération ne montre l'article.
 * @throws {OperationNotYetOpenError} la commande n'est pas encore ouverte.
 * @throws {OperationClosedError} la commande est close.
 * @throws {OperationDayOutsideError} le jour tombe hors des jours de retrait.
 * @throws {OperationDayRequiredError} aucun jour de retrait n'est demandé.
 */
export function ensureWithinOperation(lines: readonly LineOperationAccess[]): void {
  for (const line of lines) {
    const { access } = line;
    if (access === "absent") {
      throw new OperationArticleUnavailableError(line.sku, line.productName);
    }
    if (typeof access !== "string") {
      throw refusalOf(line, access);
    }
  }
}

function refusalOf(line: LineOperationAccess, closed: OperationClosed): BusinessError {
  const { operation } = closed;
  switch (closed.reason) {
    case "not_yet_open":
      return new OperationNotYetOpenError(
        line.sku,
        operation.key,
        opensAt(operation),
        operation.name.fr,
      );
    case "closed":
      return new OperationClosedError(
        line.sku,
        operation.key,
        operation.orderUntil,
        operation.name.fr,
      );
    case "day_outside":
      return new OperationDayOutsideError(
        line.sku,
        operation.pickupFrom,
        operation.pickupUntil,
        line.productName,
      );
    case "no_day":
      return new OperationDayRequiredError(
        line.sku,
        operation.pickupFrom,
        operation.pickupUntil,
        line.productName,
      );
  }
}
