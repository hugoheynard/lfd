import type { OrderRevisionQuoteView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderRevising } from "../services/order-revising.service.js";
import { quoteViewOf } from "../services/revision-quote-view.js";
import { RevisionWall } from "../services/revision-wall.js";
import { QuoteOrderRevisionQuery } from "./quote-order-revision.query.js";

/**
 * **Le devis de révision** (plan `documentation/commandes/modification/plan-modifier-une-commande.md`,
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
