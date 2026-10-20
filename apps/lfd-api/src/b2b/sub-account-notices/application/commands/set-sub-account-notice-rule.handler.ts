import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyParentReader } from "../../../account/domain/ports/company-parent.reader.js";
import { SubAccountNoticeRulesWriter } from "../../../account/domain/ports/sub-account-notice-rules.writer.js";
import { Clock } from "../../../../platform/time/clock.js";
import { defaultEnabled } from "../../domain/notified-roles.js";
import { ensurePrincipal } from "../ensure-principal.js";
import { SetSubAccountNoticeRuleCommand } from "./set-sub-account-notice-rule.command.js";

/**
 * Règle une cellule — **et l'efface si elle redit le défaut**. Une dérogation
 * identique au défaut détacherait la cellule à vie : affichée « réglée »,
 * jamais réalignée quand le défaut changera.
 *
 * @throws {NoticePrincipalNotFoundError} la société n'existe pas.
 * @throws {NotAPrincipalError} la société est un sous-compte.
 */
@CommandHandler(SetSubAccountNoticeRuleCommand)
export class SetSubAccountNoticeRuleHandler implements ICommandHandler<
  SetSubAccountNoticeRuleCommand,
  void
> {
  constructor(
    private readonly parents: CompanyParentReader,
    private readonly rules: SubAccountNoticeRulesWriter,
    private readonly clock: Clock,
  ) {}

  async execute(command: SetSubAccountNoticeRuleCommand): Promise<void> {
    await ensurePrincipal(this.parents, command.principalId);
    const cell = { kind: command.kind, role: command.role };
    if (command.enabled === defaultEnabled(command.kind, command.role)) {
      await this.rules.clear(command.principalId, cell);
      return;
    }
    await this.rules.set(
      command.principalId,
      { ...cell, enabled: command.enabled },
      command.staffId,
      this.clock.now(),
    );
  }
}
