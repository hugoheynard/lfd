import { Clock } from "../../../../../platform/time/clock.js";
import type { OrderRevisionQuoteView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { QuantitiesOnlyAfterArrestError } from "../../domain/errors/order-revision-errors.js";
import { isQuantitiesOnly } from "../../domain/services/revision-after-arrest.js";
import { OrderRevising } from "../services/order-revising.service.js";
import { quoteViewOf } from "../services/revision-quote-view.js";
import { RevisionWall } from "../services/revision-wall.js";
import { QuoteOrderRevisionQuery } from "./quote-order-revision.query.js";
import {
  closedLimitViewOf,
  exceededViewOf,
} from "../../../application/services/exceeded-limit-view.js";

/**
 * **Le devis de révision** (voir `documentation/commandes/modification/modifier-une-commande.md`,
 * § 2.2 « Le chemin d'une modification ») : la commande telle qu'elle serait, par la MÊME recomposition que la
 * modification, et l'écart avec la révision courante. Ne mute rien.
 *
 * Il refuse comme la modification — mur, règle, carte, heure limite du
 * client, bon imputé —, sauf le « rien n'a changé » (R6) et la limite d'un
 * produit que l'équipe soumet : il annonce la ligne fermée au lieu de la
 * refuser : un devis montre
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
    private readonly clock: Clock,
  ) {}

  async execute(query: QuoteOrderRevisionQuery): Promise<OrderRevisionQuoteView> {
    const current = await this.wall.find(query.orderId, query.actor);
    const scope = await this.revising.ensureRevisable(current, query.actor.kind, "revise");
    // Le devis rend les refus de prix au lieu de les lever (plan des remises
    // acquises, § 10.4) ; la modification, elle, les lève.
    const quoted = await this.revising.quote(current, query.content, query.actor, {
      requireChange: false,
      decidedAt: this.clock.now(),
      exceedItemLimits: query.exceedItemLimits,
    });
    if (scope === "quantities" && !isQuantitiesOnly(current.lines, quoted.revision)) {
      throw new QuantitiesOnlyAfterArrestError(current.orderId);
    }
    const view = quoteViewOf(current, quoted);
    // L'annonce des limites de produit n'est servie qu'à l'équipe : le devis
    // les rend sans refuser, la modification refuse une ligne non dépassable.
    if (query.actor.kind !== "staff") {
      return view;
    }
    return {
      ...view,
      itemLimitOverrides: quoted.itemLimits.exceeded.map(exceededViewOf),
      closedByItemLimit: quoted.itemLimits.closed.map(closedLimitViewOf),
    };
  }
}
