import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { ResetSubAccountNoticeRulesHandler } from "./application/commands/reset-sub-account-notice-rules.handler.js";
import { SetSubAccountNoticeRuleHandler } from "./application/commands/set-sub-account-notice-rule.handler.js";
import { GetSubAccountNoticeRulesHandler } from "./application/queries/get-sub-account-notice-rules.handler.js";
import { AdminSubAccountNoticesController } from "./http/admin-sub-account-notices.controller.js";

/**
 * **Les avis au principal** — prévenir les membres d'un principal de ce que
 * font ses sous-comptes (`documentation/comptes-client/plan-notifications-sous-comptes.md`).
 *
 * Contexte à part d'`account/` : son langage est celui d'un avis (action,
 * destinataire, dérogation), pas celui d'une société. Il ne lit les tables
 * d'`account/` que par les ports que celui-ci déclare et implémente.
 * Lot N1 : le tableau et son réglage ; les abonnés et le mail viennent en N2.
 */
@Module({
  imports: [AccountModule],
  controllers: [AdminSubAccountNoticesController],
  providers: [
    GetSubAccountNoticeRulesHandler,
    SetSubAccountNoticeRuleHandler,
    ResetSubAccountNoticeRulesHandler,
  ],
})
export class SubAccountNoticesModule {}
