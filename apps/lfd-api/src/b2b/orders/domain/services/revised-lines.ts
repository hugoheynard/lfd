import type { OrderLineInput, OrderLineSnapshot } from "../value-objects/order-line.js";

/** Une ligne demandée : un SKU et sa quantité, comme la passation les reçoit. */
export interface RequestedLine {
  readonly sku: string;
  readonly quantity: number;
}

/**
 * Les lignes d'une révision, triées entre ce qui garde son prix et ce qui
 * passe par la résolution du jour.
 */
export interface RevisedLineRequests {
  /** L'ordre des SKU tel que la demande les cite, doublons fusionnés. */
  readonly order: readonly string[];
  /** Les lignes déjà présentes, à leur prix figé et à leur nouvelle quantité. */
  readonly frozen: ReadonlyMap<string, OrderLineInput>;
  /** Les lignes nouvelles, à tarifer au jour de la modification. */
  readonly fresh: readonly RequestedLine[];
}

/**
 * **R3 du plan de modification** (`documentation/commandes/modification/plan-modifier-une-commande.md`) :
 * une ligne dont le SKU était dans la révision PRÉCÉDENTE garde son prix
 * unitaire, son taux de TVA et la trace qui les explique, quelle que soit la
 * quantité ; une ligne nouvelle est tarifée au jour, par le chemin de la
 * passation. Un SKU retiré puis remis dans une révision ultérieure n'est plus
 * dans la précédente : il repart au prix du jour.
 *
 * Les quantités d'un même SKU s'additionnent, comme `OrderLinePricing` le fait
 * à la passation : une commande ne porte qu'une ligne par SKU.
 */
export function revisedLineRequests(
  previous: readonly OrderLineSnapshot[],
  requested: readonly RequestedLine[],
): RevisedLineRequests {
  const quantities = new Map<string, number>();
  for (const line of requested) {
    quantities.set(line.sku, (quantities.get(line.sku) ?? 0) + line.quantity);
  }
  const before = new Map(previous.map((line) => [line.sku, line]));
  const frozen = new Map<string, OrderLineInput>();
  const fresh: RequestedLine[] = [];
  for (const [sku, quantity] of quantities) {
    const kept = before.get(sku);
    if (kept === undefined) {
      fresh.push({ sku, quantity });
    } else {
      frozen.set(sku, frozenLineOf(kept, quantity));
    }
  }
  return { order: [...quantities.keys()], frozen, fresh };
}

/**
 * La ligne d'avant, à sa nouvelle quantité. Le rangement et l'éligibilité à la
 * remise de retrait sont recalculés ensuite comme à la passation (R4) : ils
 * n'appartiennent pas au prix.
 */
function frozenLineOf(line: OrderLineSnapshot, quantity: number): OrderLineInput {
  return {
    sku: line.sku,
    productName: line.productName,
    unitPriceMillicents: line.unitPriceMillicents,
    vatRate: line.vatRate,
    quantity,
    pricing: line.pricing,
    allergens: line.allergens,
  };
}
