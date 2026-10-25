import {
  RevisedLinesMismatchError,
  RevisedOrderNotInPlanError,
} from "../errors/order-revision-errors.js";
import type { ProductionOrderSnapshot } from "./production-day.snapshot.js";

/** Une ligne révisée : l'article et sa nouvelle quantité due. */
export interface RevisedLine {
  readonly sku: string;
  readonly quantity: number;
}

/** Une ligne montée par la révision : de → à. Le fait de la hausse les porte. */
export interface RaisedLine {
  readonly sku: string;
  readonly productName: string;
  readonly from: number;
  readonly to: number;
}

/** Ce que la révision inscrit dans la journée : les commandes, et ce qui a monté. */
export interface RevisedPlan {
  readonly orders: readonly ProductionOrderSnapshot[];
  readonly raised: readonly RaisedLine[];
}

/**
 * **Le dû révisé d'une commande inscrite** (plan A2, § 7, B3) — pur. Les
 * lignes de la commande au fournil disent le dû, dans les deux sens : la
 * fiche, le dossier et la supervision disent vrai. Le compte du jour, lui,
 * est l'affaire de l'agrégat, qui ne le fait jamais baisser.
 *
 * Mêmes articles, quantités entières ≥ 1 : la clé (jour, commande, article)
 * ne bouge jamais, et une ligne à zéro ne s'écrirait pas au colisage (§ 7, B1).
 *
 * @throws {RevisedOrderNotInPlanError} la commande n'est pas sur ce plan.
 * @throws {RevisedLinesMismatchError} un article ajouté, retiré, ou une quantité < 1.
 */
export function revisedPlanOf(
  serviceDay: string,
  orders: readonly ProductionOrderSnapshot[],
  orderId: string,
  lines: readonly RevisedLine[],
): RevisedPlan {
  const order = orders.find((candidate) => candidate.orderId === orderId);
  if (order === undefined) {
    throw new RevisedOrderNotInPlanError(orderId, serviceDay);
  }
  const due = dueBySku(orderId, order, lines);
  const raised: RaisedLine[] = [];
  const revisedLines = order.lines.map((line) => {
    const to = due.get(line.sku) ?? line.quantity;
    if (to > line.quantity) {
      raised.push({ sku: line.sku, productName: line.productName, from: line.quantity, to });
    }
    return { ...line, quantity: to };
  });
  return {
    orders: orders.map((candidate) =>
      candidate.orderId === orderId ? { ...candidate, lines: revisedLines } : candidate,
    ),
    raised,
  };
}

/** Le dû par article, refusé s'il ne recouvre pas exactement les articles de la commande. */
function dueBySku(
  orderId: string,
  order: ProductionOrderSnapshot,
  lines: readonly RevisedLine[],
): ReadonlyMap<string, number> {
  const due = new Map(lines.map((line) => [line.sku, line.quantity]));
  const known = new Set(order.lines.map((line) => line.sku));
  const sameArticles =
    due.size === lines.length &&
    due.size === known.size &&
    [...due.keys()].every((sku) => known.has(sku));
  const validQuantities = lines.every(
    (line) => Number.isInteger(line.quantity) && line.quantity >= 1,
  );
  if (!sameArticles || !validQuantities) {
    throw new RevisedLinesMismatchError(orderId);
  }
  return due;
}
