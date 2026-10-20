import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CompanyParentReader } from "../../../account/domain/ports/company-parent.reader.js";
import { SubAccountNoticeRulesReader } from "../../../account/domain/ports/sub-account-notice-rules.reader.js";
import { noticeGrid, type NoticeCell } from "../../domain/notified-roles.js";
import { ensurePrincipal } from "../ensure-principal.js";
import { GetSubAccountNoticeRulesQuery } from "./get-sub-account-notice-rules.query.js";

/**
 * Le tableau fusionné — dérogations sinon défaut —, résolu ici pour que
 * l'écran n'ait jamais à recomposer `dérogation ?? défaut`.
 */
@QueryHandler(GetSubAccountNoticeRulesQuery)
export class GetSubAccountNoticeRulesHandler implements IQueryHandler<
  GetSubAccountNoticeRulesQuery,
  NoticeCell[]
> {
  constructor(
    private readonly parents: CompanyParentReader,
    private readonly rules: SubAccountNoticeRulesReader,
  ) {}

  async execute(query: GetSubAccountNoticeRulesQuery): Promise<NoticeCell[]> {
    await ensurePrincipal(this.parents, query.principalId);
    return noticeGrid(await this.rules.overridesOf(query.principalId));
  }
}
