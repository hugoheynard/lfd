import type { OrderDraftView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderDraftRepository } from "../../domain/ports/order-draft.repository.js";
import { GetOrderDraftQuery } from "./get-order-draft.query.js";
import { SaleReferenceIntake } from "../../../catalog/application/sale-reference-intake.service.js";

/**
 * Rend le brouillon d'une société, ou `null`.
 *
 * `null` pour « aucun brouillon » comme pour « société inconnue » : l'écran de
 * saisie n'arrive jamais là sans un compte qu'il vient de lire, et distinguer
 * ici les deux cas ne changerait rien à ce qu'il affiche.
 *
 * Ses lignes sortent sous la référence de l'article qu'elles désignent
 * (`plan-defaut-sous-sa-reference.md`, § 5), jusqu'à la prochaine écriture.
 */
@QueryHandler(GetOrderDraftQuery)
export class GetOrderDraftHandler implements IQueryHandler<
  GetOrderDraftQuery,
  OrderDraftView | null
> {
  constructor(
    private readonly drafts: OrderDraftRepository,
    private readonly intake: SaleReferenceIntake,
  ) {}

  async execute(query: GetOrderDraftQuery): Promise<OrderDraftView | null> {
    const draft = await this.drafts.find(query.companyId);
    if (draft === null) {
      return null;
    }
    return { ...draft, lines: [...(await this.intake.normalized(draft.lines, "order_draft"))] };
  }
}
