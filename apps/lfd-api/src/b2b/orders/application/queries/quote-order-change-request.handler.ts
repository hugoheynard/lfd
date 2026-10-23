import type { OrderRevisionQuoteView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { RevisableOrder } from "../../domain/entities/order-revision.js";
import { OrderChangeNotQuotableError } from "../../domain/errors/order-change-quote-errors.js";
import { standingRevisionErrorOf } from "../../domain/errors/order-revision-errors.js";
import type { RevisionVerdict } from "../../domain/services/order-revisability.js";
import { OrderRevisabilityReading } from "../services/order-revisability-reading.js";
import { OrderRevising } from "../services/order-revising.service.js";
import { quoteViewOf } from "../services/revision-quote-view.js";
import { RevisionWall } from "../services/revision-wall.js";
import { QuoteOrderChangeRequestQuery } from "./quote-order-change-request.query.js";

/**
 * **Le devis d'une demande de modification** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, §14 ; décision de
 * Hugo du 2026-10-23 : « oui montre le nouveau total au client »).
 *
 * Le mur du client (`RevisionWall`, celui de `GET /orders/:id` : hors mur,
 * `404`), puis LA règle de la modification lue pour le client — celle que
 * `ChangeableOrderReader` réduit pour `RequestOrderChange` : seul « trop
 * tard » (`past_cutoff`) est admis. Puis la MÊME recomposition que la
 * modification, aux règles de l'équipe, qui l'appliquera : prix d'origine
 * pour une ligne déjà présente, prix du jour pour une nouvelle.
 *
 * Indicatif : la demande ne range aucun montant, l'équipe recalcule à
 * l'application sur la commande telle qu'elle sera.
 */
@QueryHandler(QuoteOrderChangeRequestQuery)
export class QuoteOrderChangeRequestHandler implements IQueryHandler<
  QuoteOrderChangeRequestQuery,
  OrderRevisionQuoteView
> {
  constructor(
    private readonly wall: RevisionWall,
    private readonly reading: OrderRevisabilityReading,
    private readonly revising: OrderRevising,
  ) {}

  async execute(query: QuoteOrderChangeRequestQuery): Promise<OrderRevisionQuoteView> {
    const author = { kind: "customer", userId: query.actorUserId } as const;
    const current = await this.wall.find(query.orderId, author);
    ensureRequestable(current, await this.reading.verdictOf(current, "customer"));
    const revision = await this.revising.compose(current, query.content, author, {
      requireChange: false,
      rulesOf: "staff",
    });
    return quoteViewOf(current, revision);
  }
}

/**
 * @throws {OrderChangeNotQuotableError} encore modifiable, ou au plan.
 * @throws le refus commun du geste (carte, engagée, annulée…), avec sa phrase.
 */
function ensureRequestable(order: RevisableOrder, verdict: RevisionVerdict): void {
  if (verdict.revisable) {
    throw new OrderChangeNotQuotableError(order.orderNumber, "still_revisable");
  }
  const { block } = verdict;
  switch (block.kind) {
    case "past_cutoff":
      return;
    case "plan_closed":
      throw new OrderChangeNotQuotableError(order.orderNumber, "in_preparation");
    default:
      throw standingRevisionErrorOf(order.orderId, block);
  }
}
