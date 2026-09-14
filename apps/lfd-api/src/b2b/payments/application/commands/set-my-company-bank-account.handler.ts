import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { BankAccountGuardReader } from "../../domain/ports/bank-account-guard.reader.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { ensureBankAccountAccess } from "../../domain/services/bank-account-access.js";
import { recordCompanyBankAccount } from "./record-company-bank-account.js";
import { SetMyCompanyBankAccountCommand } from "./set-my-company-bank-account.command.js";

/**
 * Dépose le RIB après le mur (détenteur ou facturation) — la séquence de dépôt
 * est celle du staff, partagée.
 *
 * Le mur passe **avant** la validation de l'IBAN : un non-membre reçoit un 404,
 * jamais un 400 qui lui apprendrait que la société existe et qu'on a lu sa
 * saisie.
 */
@CommandHandler(SetMyCompanyBankAccountCommand)
export class SetMyCompanyBankAccountHandler implements ICommandHandler<
  SetMyCompanyBankAccountCommand,
  void
> {
  constructor(
    private readonly guard: BankAccountGuardReader,
    private readonly accounts: CompanyBankAccountRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: SetMyCompanyBankAccountCommand): Promise<void> {
    const role = await this.guard.roleOf(command.actorUserId, command.companyId);
    ensureBankAccountAccess(role, command.companyId);

    await recordCompanyBankAccount(command.companyId, command.payload, this.accounts, this.ids);
  }
}
