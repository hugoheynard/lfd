import { lineTotalCents, saleQuantity, ttcCentsOf } from "@lfd/money";

import type { DecidedDeparture } from "../../../orders/domain/ports/shortfall-decision.reader.js";
import type { DeliveryNoteSource } from "../entities/delivery-note.js";
import { DecisionOutsideOrderError } from "../errors/delivery-note-errors.js";
import type { DeliveryNoteSourceLine } from "../value-objects/delivery-note-line.js";
import { DeliveryNoteTerms } from "../value-objects/delivery-note-terms.js";
import { exactDepartureOf } from "./exact-departure.js";

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
 * Une commande composée en TTC (`exact_ht`) ne recopie aucune ligne figée :
 * {@link exactDepartureOf} les réécrit toutes, avec l'en-tête (plan
 * `documentation/pricing/plan-centime-particuliers.md`, § 5).
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
  const quantities = order.lines.map((line) => {
    const wanted = left.get(line.sku) ?? 0;
    const quantity = Math.min(wanted, line.quantity);
    left.set(line.sku, wanted - quantity);
    return quantity;
  });
  const over = [...left.entries()].find(([, quantity]) => quantity > 0);
  if (over !== undefined) {
    throw new DecisionOutsideOrderError(order.orderNumber, over[0]);
  }
  const { adjustments } = decision;
  if (adjustments.exact !== null) {
    const departing = order.lines.map((line, i) => ({ ...line, quantity: quantities[i] ?? 0 }));
    const exact = exactDepartureOf({
      orderNumber: order.orderNumber,
      lines: departing,
      adjustments,
      exact: adjustments.exact,
    });
    return { ...order, lines: exact.lines, terms: exact.terms, departureDecided: true };
  }
  const lines = order.lines.map((line, i) => reducedLine(line, quantities[i] ?? 0));
  const terms = DeliveryNoteTerms.composePartial({
    orderNumber: order.orderNumber,
    lines,
    adjustments,
  });
  return { ...order, lines, terms, departureDecided: true };
}

function reducedLine(line: DeliveryNoteSourceLine, quantity: number): DeliveryNoteSourceLine {
  if (quantity === line.quantity) {
    return line;
  }
  const htCents = lineTotalCents(line.unitPriceMillicents, saleQuantity(quantity, line.saleUnit));
  return {
    ...line,
    quantity,
    lineTotalCents: htCents,
    lineTotalTtcCents: line.lineTotalTtcCents === null ? null : ttcCentsOf(htCents, line.vatRate),
  };
}
