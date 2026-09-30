import type { PurchaseBinCandidatesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { PurchaseBinCandidatesReader } from "../../domain/ports/purchase-bin-candidates.reader.js";
import { ListPurchaseBinCandidatesQuery } from "./list-purchase-bin-candidates.query.js";

/** La bibliothèque d'achat, côté bacs : par nom, les archivés sur demande. */
@QueryHandler(ListPurchaseBinCandidatesQuery)
export class ListPurchaseBinCandidatesHandler implements IQueryHandler<
  ListPurchaseBinCandidatesQuery,
  PurchaseBinCandidatesView
> {
  constructor(private readonly reader: PurchaseBinCandidatesReader) {}

  async execute(query: ListPurchaseBinCandidatesQuery): Promise<PurchaseBinCandidatesView> {
    return { candidates: await this.reader.list(query.includeArchived) };
  }
}
