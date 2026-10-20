import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CompanyParentReader } from "../../../account/domain/ports/company-parent.reader.js";
import { SubAccountNoticeSwitchReader } from "../../../account/domain/ports/sub-account-notice-switch.js";
import { SubAccountNoticeRulesReader } from "../../../account/domain/ports/sub-account-notice-rules.reader.js";
import { noticeGrid, type NoticeCell } from "../../domain/notified-roles.js";

/** L'interrupteur et le tableau d'un principal. */
export interface NoticeBoard {
  readonly enabled: boolean;
  readonly cells: NoticeCell[];
}
import { ensurePrincipal } from "../ensure-principal.js";
import { GetSubAccountNoticeRulesQuery } from "./get-sub-account-notice-rules.query.js";

/**
 * Le tableau fusionné — dérogations sinon défaut —, résolu ici pour que
 * l'écran n'ait jamais à recomposer `dérogation ?? défaut` ; et l'interrupteur
 * (désactivé tant que le staff ne l'a pas activé).
 */
@QueryHandler(GetSubAccountNoticeRulesQuery)
export class GetSubAccountNoticeRulesHandler implements IQueryHandler<
  GetSubAccountNoticeRulesQuery,
  NoticeBoard
> {
  constructor(
    private readonly parents: CompanyParentReader,
    private readonly rules: SubAccountNoticeRulesReader,
    private readonly switches: SubAccountNoticeSwitchReader,
  ) {}

  async execute(query: GetSubAccountNoticeRulesQuery): Promise<NoticeBoard> {
    await ensurePrincipal(this.parents, query.principalId);
    return {
      enabled: await this.switches.isEnabled(query.principalId),
      cells: noticeGrid(await this.rules.overridesOf(query.principalId)),
    };
  }
}
