import type { DetachedUnpaidOrdersView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DetachedUnpaidReader } from "../../domain/ports/detached-unpaid.reader.js";
import { readDetachedUnpaid } from "../detached-unpaid-support.js";
import { GetDetachedUnpaidOrdersQuery } from "./detached-unpaid-queries.js";

/**
 * Les impayés d'un site détaché, sur la fiche du site ET sur celle de son
 * ancien principal (`plan-sous-comptes.md` §2.1 quater, R3). Le droit est
 * celui du contrôleur ; aucun mur tenant côté staff.
 */
@QueryHandler(GetDetachedUnpaidOrdersQuery)
export class GetDetachedUnpaidOrdersHandler implements IQueryHandler<
  GetDetachedUnpaidOrdersQuery,
  DetachedUnpaidOrdersView
> {
  constructor(private readonly reader: DetachedUnpaidReader) {}

  execute(query: GetDetachedUnpaidOrdersQuery): Promise<DetachedUnpaidOrdersView> {
    return readDetachedUnpaid(this.reader, query.companyId);
  }
}
