import { lineTotalCents, ttcCentsOf } from "@lfd/money";

import type { DecidedDeparture } from "../../../orders/domain/ports/shortfall-decision.reader.js";
import type { DeliveryNoteSource } from "../entities/delivery-note.js";
import { DecisionOutsideOrderError } from "../errors/delivery-note-errors.js";
import type { DeliveryNoteSourceLine } from "../value-objects/delivery-note-line.js";
import { DeliveryNoteTerms } from "../value-objects/delivery-note-terms.js";

/**
 * **La commande telle que son BL la voit, une fois le départ décidé** (plan
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 13, bloquant 1) :
 * les mêmes lignes, aux quantités décidées, et l'en-tête recomposé par
 * {@link DeliveryNoteTerms.composePartial}. Sans décision, la commande telle
 * quelle — les trois écrivains du BL passent tous par ici.
 *
 * Une quantité décidée par article se répartit sur les lignes de ce SKU dans
 * leur ordre, la première d'abord ; une ligne qui ne part pas reste, à zéro,
 * pour que « livré = Σ des BL » n'en perde aucune. Le HT d'une ligne réduite
 * passe par `lineTotalCents`, le TTC scellé par `ttcCentsOf` — les mêmes
 * arrondis que la ligne de commande.
 *
 * Idempotente : appliquée à sa propre sortie, elle la rend.
 *
 * @throws {DecisionOutsideOrderError} un article décidé au-delà de la commande.
 */
export function departingSourceOf<T extends DeliveryNoteSource>(
  order: T,
  decision: DecidedDeparture | undefined,
): T {
  if (decision === undefined) {
    return order;
  }
  const left = new Map(decision.departing.map((line) => [line.sku, line.quantity]));
  const lines = order.lines.map((line) => {
    const wanted = left.get(line.sku) ?? 0;
    const quantity = Math.min(wanted, line.quantity);
    left.set(line.sku, wanted - quantity);
    return reducedLine(line, quantity);
  });
  const over = [...left.entries()].find(([, quantity]) => quantity > 0);
  if (over !== undefined) {
    throw new DecisionOutsideOrderError(order.orderNumber, over[0]);
  }
  const terms = DeliveryNoteTerms.composePartial({
    orderNumber: order.orderNumber,
    lines,
    adjustments: decision.adjustments,
  });
  return { ...order, lines, terms, departureDecided: true };
}

function reducedLine(line: DeliveryNoteSourceLine, quantity: number): DeliveryNoteSourceLine {
  if (quantity === line.quantity) {
    return line;
  }
  const htCents = lineTotalCents(line.unitPriceMillicents, quantity);
  return {
    ...line,
    quantity,
    lineTotalCents: htCents,
    lineTotalTtcCents: line.lineTotalTtcCents === null ? null : ttcCentsOf(htCents, line.vatRate),
  };
}
