import type { OrderDraftSummaryView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { OrderDraftRepository } from "../../domain/ports/order-draft.repository.js";
import { ListOrderDraftSummariesQuery } from "./list-order-draft-summaries.query.js";

/**
 * Les brouillons en attente, pour la pastille des comptes au comptoir : la
 * saisie interrompue se signale sans qu'on ait à se souvenir du client.
 *
 * L'auteur est nommé par l'annuaire en une lecture pour toute la liste ; une
 * fiche que l'annuaire ne reconnaît plus rend `null`, jamais un nom inventé.
 */
@QueryHandler(ListOrderDraftSummariesQuery)
export class ListOrderDraftSummariesHandler implements IQueryHandler<
  ListOrderDraftSummariesQuery,
  readonly OrderDraftSummaryView[]
> {
  constructor(
    private readonly drafts: OrderDraftRepository,
    private readonly staff: StaffAuthorDirectory,
  ) {}

  async execute(): Promise<readonly OrderDraftSummaryView[]> {
    const summaries = await this.drafts.listSummaries();
    const authors = await this.staff.identify(summaries.map((draft) => draft.savedByStaffId));
    return summaries.map((draft) => ({
      companyId: draft.companyId,
      savedAt: draft.savedAt.toISOString(),
      savedByName: authors.nameOf(draft.savedByStaffId),
    }));
  }
}
