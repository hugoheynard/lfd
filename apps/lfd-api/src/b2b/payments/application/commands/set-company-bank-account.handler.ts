import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { recordCompanyBankAccount } from "./record-company-bank-account.js";
import { SetCompanyBankAccountCommand } from "./set-company-bank-account.command.js";

/**
 * Recopie le RIB d'un client, depuis le **back-office**.
 *
 * ## Le cycle de vie est celui de l'agrégat, pas une écriture ciblée
 *
 * On charge, on mute par une méthode métier, on sauve. Une `repo.setIban(...)`
 * serait plus courte de trois lignes et mettrait la règle du changement de
 * compte dans ce fichier — donc invisible au prochain handler qui touchera au
 * même sujet.
 *
 * La séquence vit dans `recordCompanyBankAccount`, partagée avec le chemin
 * client (`SetMyCompanyBankAccountHandler`) : ce handler-ci n'a pas de mur
 * propre, la surface staff le pose en amont.
 *
 * La commande ne rend rien : CQRS, le client relit.
 */
@CommandHandler(SetCompanyBankAccountCommand)
export class SetCompanyBankAccountHandler implements ICommandHandler<
  SetCompanyBankAccountCommand,
  void
> {
  constructor(
    private readonly accounts: CompanyBankAccountRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute({ companyId, payload }: SetCompanyBankAccountCommand): Promise<void> {
    await recordCompanyBankAccount(companyId, payload, this.accounts, this.ids);
  }
}
