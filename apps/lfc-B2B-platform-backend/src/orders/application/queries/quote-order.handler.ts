import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { OrderQuoteLineView, OrderQuotePayload, OrderQuoteView } from "@lfd/contracts";

import { OrderDrafting } from "../services/order-drafting.service.js";
import type { OrderLineInput } from "../../domain/value-objects/order-line.js";

/**
 * **Ce que la commande coûterait**, demandé avant de la passer.
 *
 * Une **requête** et non une commande : elle ne mute rien, elle répond. Le
 * panier du staff l'appelle à chaque changement de contenu ou de client, parce
 * que le prix dépend des deux — la mercuriale du client, le palier atteint par
 * la quantité — et qu'aucun des deux ne se devine dans le navigateur.
 */
export class QuoteOrderQuery {
  constructor(
    readonly staffUserId: string,
    readonly payload: OrderQuotePayload,
  ) {}
}

@QueryHandler(QuoteOrderQuery)
export class QuoteOrderHandler implements IQueryHandler<QuoteOrderQuery, OrderQuoteView> {
  constructor(private readonly drafting: OrderDrafting) {}

  async execute(query: QuoteOrderQuery): Promise<OrderQuoteView> {
    const lines = await this.drafting.quote(
      {
        companyId: query.payload.companyId,
        // L'estimation ne s'attribue à personne : elle ne crée rien. Le saisisseur
        // n'apparaît qu'au moment où une commande existe, et porte une trace.
        placedByUserId: query.staffUserId,
        placedByStaffId: query.staffUserId,
      },
      query.payload.lines.map((line) => ({
        sku: line.sku,
        productName: "",
        unitPriceCents: 0,
        vatRate: 0,
        quantity: line.quantity,
        pricing: null,
      })),
    );

    return {
      lines: lines.map(toQuoteLine),
      subtotalCents: lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0),
    };
  }
}

/**
 * La ligne résolue → sa vue.
 *
 * `canonicalCents` vient de la **trace**, pas d'une seconde lecture du
 * catalogue : c'est le tarif d'entrée que la résolution a réellement utilisé, et
 * le relire ailleurs pourrait donner un autre nombre entre-temps. Sans trace —
 * une ligne qu'aucune règle n'a touchée — le prix final EST le tarif d'entrée.
 */
function toQuoteLine(line: OrderLineInput): OrderQuoteLineView {
  const trace = line.pricing ?? null;
  return {
    sku: line.sku,
    productName: line.productName,
    canonicalCents: trace?.basePriceCents ?? line.unitPriceCents,
    unitPriceCents: line.unitPriceCents,
    quantity: line.quantity,
    vatRate: line.vatRate,
    steps: trace?.steps ?? [],
    floored: trace?.floored ?? false,
  };
}
