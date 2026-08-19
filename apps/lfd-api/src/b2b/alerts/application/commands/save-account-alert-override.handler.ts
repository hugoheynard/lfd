import { sameAlertRule } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { resolveGlobalRules } from "../../domain/alert-rules.js";
import { CompanyNotFoundForAlertsError } from "../../domain/errors/alert-errors.js";
import { AccountAlertOverridesStore } from "../../domain/ports/account-alert-overrides.store.js";
import { AlertRulesStore } from "../../domain/ports/alert-rules.store.js";
import { AlertCompanyReader } from "../../domain/ports/company.reader.js";
import { SaveAccountAlertOverrideCommand } from "./save-account-alert-override.command.js";

/**
 * Écrit la dérogation d'un compte — **sauf si elle n'en est pas une**.
 *
 * Une règle propre au compte qui redit mot pour mot le réglage global n'est pas
 * une dérogation : c'est un compte qui suit la plateforme. L'enregistrer telle
 * quelle le détacherait à vie — affiché « réglée pour ce compte », contenu
 * identique, et plus jamais aligné sur les évolutions futures. Un aller-retour
 * dans l'éditeur suffisait à provoquer ça.
 *
 * On supprime donc la dérogation dans ce cas. Le compte revient à l'héritage,
 * qui est l'état par défaut et se lit sans ambiguïté.
 */
@CommandHandler(SaveAccountAlertOverrideCommand)
export class SaveAccountAlertOverrideHandler implements ICommandHandler<
  SaveAccountAlertOverrideCommand,
  void
> {
  constructor(
    private readonly overrides: AccountAlertOverridesStore,
    private readonly rules: AlertRulesStore,
    private readonly companies: AlertCompanyReader,
  ) {}

  async execute(command: SaveAccountAlertOverrideCommand): Promise<void> {
    // Sans ce contrôle, un identifiant inconnu remontait une violation de clé
    // étrangère — donc un 500 pour une erreur d'appelant ordinaire.
    if (!(await this.companies.exists(command.companyId))) {
      throw new CompanyNotFoundForAlertsError(command.companyId);
    }
    if (await this.redundant(command)) {
      await this.overrides.clear(command.companyId, command.override.kind);
      return;
    }
    await this.overrides.save(command.companyId, command.override, command.staffSub);
  }

  /** La règle proposée dit-elle exactement ce que dit déjà la plateforme ? */
  private async redundant(command: SaveAccountAlertOverrideCommand): Promise<boolean> {
    if (command.override.mode !== "custom") {
      return false;
    }
    const global = resolveGlobalRules(await this.rules.readAll()).find(
      (view) => view.kind === command.override.kind,
    );
    if (global === undefined) {
      return false;
    }
    return sameAlertRule(command.override.rule, {
      enabled: global.enabled,
      params: global.params,
      delivery: global.delivery,
    });
  }
}
