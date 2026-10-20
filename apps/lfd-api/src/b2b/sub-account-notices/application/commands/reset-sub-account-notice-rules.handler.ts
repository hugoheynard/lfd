import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyParentReader } from "../../../account/domain/ports/company-parent.reader.js";
import { SubAccountNoticeRulesWriter } from "../../../account/domain/ports/sub-account-notice-rules.writer.js";
import { ensurePrincipal } from "../ensure-principal.js";
import { ResetSubAccountNoticeRulesCommand } from "./reset-sub-account-notice-rules.command.js";

/**
 * Efface toutes les dérogations du principal : le tableau retombe sur le
 * défaut du domaine. Sans dérogation, ne fait rien.
 *
 * @throws {NoticePrincipalNotFoundError} la société n'existe pas.
 * @throws {NotAPrincipalError} la société est un sous-compte.
 */
@CommandHandler(ResetSubAccountNoticeRulesCommand)
export class ResetSubAccountNoticeRulesHandler implements ICommandHandler<
  ResetSubAccountNoticeRulesCommand,
  void
> {
  constructor(
    private readonly parents: CompanyParentReader,
    private readonly rules: SubAccountNoticeRulesWriter,
  ) {}

  async execute(command: ResetSubAccountNoticeRulesCommand): Promise<void> {
    await ensurePrincipal(this.parents, command.principalId);
    await this.rules.clearAll(command.principalId);
  }
}
