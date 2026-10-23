import type { OrderRevisionQuoteView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { OrderRevisionToSave, RevisableOrder } from "../../domain/entities/order-revision.js";
import { OrderRevising } from "../services/order-revising.service.js";
import { RevisionWall } from "../services/revision-wall.js";
import { QuoteOrderRevisionQuery } from "./quote-order-revision.query.js";

/**
 * **Le devis de révision** (plan `documentation/commandes/plan-modifier-une-commande.md`,
 * M1) : la commande telle qu'elle serait, par la MÊME recomposition que la
 * modification, et l'écart avec la révision courante. Ne mute rien.
 *
 * Il refuse comme la modification — mur, règle, carte, heure limite du
 * client, bon imputé —, sauf le « rien n'a changé » (R6) : un devis montre
 * aussi le panier qu'on n'a pas encore touché.
 */
@QueryHandler(QuoteOrderRevisionQuery)
export class QuoteOrderRevisionHandler implements IQueryHandler<
  QuoteOrderRevisionQuery,
  OrderRevisionQuoteView
> {
  constructor(
    private readonly wall: RevisionWall,
    private readonly revising: OrderRevising,
  ) {}

  async execute(query: QuoteOrderRevisionQuery): Promise<OrderRevisionQuoteView> {
    const current = await this.wall.find(query.orderId, query.actor);
    await this.revising.ensureRevisable(current);
    const revision = await this.revising.compose(current, query.content, query.actor, {
      requireChange: false,
    });
    return quoteViewOf(current, revision);
  }
}

function quoteViewOf(
  current: RevisableOrder,
  revision: OrderRevisionToSave,
): OrderRevisionQuoteView {
  const { state } = revision;
  const previous = new Set(current.lines.map((line) => line.sku));
  return {
    revision: current.revision,
    lines: state.lines.map((line) => ({
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      unitPriceMillicents: line.unitPriceMillicents,
      vatRate: line.vatRate,
      lineTotalCents: line.lineTotalCents,
      priceFrozen: previous.has(line.sku),
    })),
    subtotalCents: state.subtotalCents,
    discountCents: state.discountCents,
    deliveryFeeCents: state.deliveryFeeCents,
    lateFeeCents: state.lateFeeCents,
    voucherDiscountCents: state.voucherDiscountCents,
    vatCents: state.vatCents,
    totalCents: state.totalCents,
    previousTotalCents: current.totalCents,
    differenceCents: state.totalCents - current.totalCents,
    changes: revision.changes,
  };
}
