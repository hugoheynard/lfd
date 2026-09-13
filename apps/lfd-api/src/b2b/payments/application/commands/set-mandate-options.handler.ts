import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyBankAccountNotFoundError } from "../../domain/errors/mandate-errors.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { MandateOptions } from "../../domain/value-objects/mandate-options.js";
import { SetMandateOptionsCommand } from "./set-mandate-options.command.js";

/**
 * Pose les zones facultatives du mandat.
 *
 * ## Pourquoi il REFUSE quand le RIB manque
 *
 * Ces zones vivent sur la même ligne que le RIB — elles remplissent le même
 * papier. Sans RIB, il n'y a pas de ligne, et la seule alternative serait d'en
 * créer une sans compte : un « côté client du mandat » sans le compte à
 * débiter, c'est-à-dire l'état que le modèle refuse d'exprimer partout ailleurs.
 *
 * L'ordre des étapes à l'écran dit déjà la même chose : le RIB d'abord.
 */
@CommandHandler(SetMandateOptionsCommand)
export class SetMandateOptionsHandler implements ICommandHandler<SetMandateOptionsCommand, void> {
  constructor(private readonly accounts: CompanyBankAccountRepository) {}

  async execute({ companyId, payload }: SetMandateOptionsCommand): Promise<void> {
    const account = await this.accounts.findByCompany(companyId);
    if (account === null) {
      throw new CompanyBankAccountNotFoundError(companyId);
    }

    account.setOptions(MandateOptions.create(payload));
    await this.accounts.save(account);
  }
}
