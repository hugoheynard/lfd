import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AlertRuleModifiedElsewhereError } from "../../domain/errors/alert-errors.js";
import { AlertRulesStore } from "../../domain/ports/alert-rules.store.js";
import { SaveAlertRuleCommand } from "./save-alert-rule.command.js";

/**
 * Écrit le réglage global d'un type — **si personne ne l'a touché entre-temps**.
 *
 * On refuse plutôt que d'arbitrer : deux commerciaux sur l'écran Réglages ont
 * chacun une intention, et écraser silencieusement la première ferait disparaître
 * un changement sans que son auteur l'apprenne jamais. L'écran recharge et montre
 * ce qui a été écrit.
 */
@CommandHandler(SaveAlertRuleCommand)
export class SaveAlertRuleHandler implements ICommandHandler<SaveAlertRuleCommand, void> {
  constructor(private readonly store: AlertRulesStore) {}

  async execute(command: SaveAlertRuleCommand): Promise<void> {
    const written = await this.store.save({
      kind: command.rule.params.kind,
      rule: command.rule,
      staffSub: command.staffSub,
      expectedUpdatedAt: command.expectedUpdatedAt,
    });
    if (!written) {
      throw new AlertRuleModifiedElsewhereError(command.rule.params.kind);
    }
  }
}
