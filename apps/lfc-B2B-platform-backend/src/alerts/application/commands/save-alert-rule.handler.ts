import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AlertRulesStore } from "../../domain/ports/alert-rules.store.js";
import { SaveAlertRuleCommand } from "./save-alert-rule.command.js";

/**
 * Écrit le réglage global d'un type. Réservé au **staff** — la porte est
 * l'`AdminAuthGuard` sur la route, la charge est déjà validée (Zod) à la
 * frontière, et la cohérence seuils/bornes vit dans le schéma du contrat.
 */
@CommandHandler(SaveAlertRuleCommand)
export class SaveAlertRuleHandler implements ICommandHandler<SaveAlertRuleCommand, void> {
  constructor(private readonly store: AlertRulesStore) {}

  async execute(command: SaveAlertRuleCommand): Promise<void> {
    await this.store.save(command.rule.params.kind, command.rule, command.staffSub);
  }
}
