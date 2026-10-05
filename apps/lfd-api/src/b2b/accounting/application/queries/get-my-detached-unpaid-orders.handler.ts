import type { DetachedUnpaidOrdersView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DetachedUnpaidReader } from "../../domain/ports/detached-unpaid.reader.js";
import { UnpaidAccessReader } from "../../domain/ports/unpaid-access.reader.js";
import { ensureUnpaidAccess } from "../../domain/services/unpaid-access.js";
import { readDetachedUnpaid } from "../detached-unpaid-support.js";
import { GetMyDetachedUnpaidOrdersQuery } from "./detached-unpaid-queries.js";

/**
 * « 3 commandes du chalet X restent à régler » — côté client, pour le
 * principal (`plan-sous-comptes.md` §2.1 quater). Murée sur la société
 * déclarée : un principal voit ce qu'il réglait, un site ce qu'il a commandé ;
 * jamais les impayés d'un autre.
 */
@QueryHandler(GetMyDetachedUnpaidOrdersQuery)
export class GetMyDetachedUnpaidOrdersHandler implements IQueryHandler<
  GetMyDetachedUnpaidOrdersQuery,
  DetachedUnpaidOrdersView
> {
  constructor(
    private readonly access: UnpaidAccessReader,
    private readonly reader: DetachedUnpaidReader,
  ) {}

  async execute(query: GetMyDetachedUnpaidOrdersQuery): Promise<DetachedUnpaidOrdersView> {
    ensureUnpaidAccess(
      await this.access.roleOf(query.actorUserId, query.companyId),
      query.companyId,
    );
    return readDetachedUnpaid(this.reader, query.companyId);
  }
}
