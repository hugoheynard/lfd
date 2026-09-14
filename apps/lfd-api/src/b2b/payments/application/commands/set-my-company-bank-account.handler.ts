import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { BankAccountBoundToActiveMandateError } from "../../domain/errors/mandate-errors.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
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
 *
 * 🔴 **Refusé en 409 tant qu'un mandat est actif** (depuis le 2026-09-14, plan
 * mandat client §8) : le papier signé nomme ce compte, et le changement de
 * banque passe par le staff. Un brouillon, lui, ne bloque rien — il est révoqué
 * par l'écriture, et le client régénère.
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
    private readonly mandates: PaymentMandateRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly notifier: StaffNotifier,
  ) {}

  async execute(command: SetMyCompanyBankAccountCommand): Promise<void> {
    const role = await this.guard.roleOf(command.actorUserId, command.companyId);
    ensureBankAccountAccess(role, command.companyId);

    const current = await this.mandates.findCurrent(command.companyId);
    if (current?.debitable() === true) {
      throw new BankAccountBoundToActiveMandateError(command.companyId);
    }

    await recordCompanyBankAccount(command.companyId, command.payload, {
      accounts: this.accounts,
      ids: this.ids,
      mandates: this.mandates,
      clock: this.clock,
      events: this.events,
      uow: this.uow,
      notifier: this.notifier,
    });
  }
}
