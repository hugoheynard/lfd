import type { OrderRevisionQuoteView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { QuantitiesOnlyAfterArrestError } from "../../domain/errors/order-revision-errors.js";
import { isQuantitiesOnly } from "../../domain/services/revision-after-arrest.js";
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
 * aussi le panier qu'on n'a pas encore touché. Après l'arrêt du plan (plan
 * A2, § 7), il refuse aussi ce qui n'est pas un changement de quantités —
 * un panier encore intact passe.
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
    const scope = await this.revising.ensureRevisable(current, query.actor.kind);
    const revision = await this.revising.compose(current, query.content, query.actor, {
      requireChange: false,
    });
    if (scope === "quantities" && !isQuantitiesOnly(current.lines, revision)) {
      throw new QuantitiesOnlyAfterArrestError(current.orderId);
    }
    return quoteViewOf(current, revision);
  }
}
