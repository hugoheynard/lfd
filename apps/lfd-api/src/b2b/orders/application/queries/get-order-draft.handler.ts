import type { OrderDraftView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderDraftRepository } from "../../domain/ports/order-draft.repository.js";
import { GetOrderDraftQuery } from "./get-order-draft.query.js";

/**
 * Rend le brouillon d'une société, ou `null`.
 *
 * `null` pour « aucun brouillon » comme pour « société inconnue » : l'écran de
 * saisie n'arrive jamais là sans un compte qu'il vient de lire, et distinguer
 * ici les deux cas ne changerait rien à ce qu'il affiche.
 */
@QueryHandler(GetOrderDraftQuery)
export class GetOrderDraftHandler implements IQueryHandler<
  GetOrderDraftQuery,
  OrderDraftView | null
> {
  constructor(private readonly drafts: OrderDraftRepository) {}

  execute(query: GetOrderDraftQuery): Promise<OrderDraftView | null> {
    return this.drafts.find(query.companyId);
  }
}
