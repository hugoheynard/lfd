import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { recordMandateOptions } from "./record-mandate-options.js";
import { SetMandateOptionsCommand } from "./set-mandate-options.command.js";

/**
 * Pose les zones facultatives du mandat, pour le staff.
 *
 * La séquence — RIB requis (404), écriture, brouillon rendu caduc, cloche — est
 * partagée avec le client depuis le 2026-09-14 : voir `recordMandateOptions`.
 * Le staff n'a pas le refus sous mandat actif du client.
 */
@CommandHandler(SetMandateOptionsCommand)
export class SetMandateOptionsHandler implements ICommandHandler<SetMandateOptionsCommand, void> {
  constructor(
    private readonly accounts: CompanyBankAccountRepository,
    private readonly mandates: PaymentMandateRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly notifier: StaffNotifier,
  ) {}

  async execute({ companyId, payload }: SetMandateOptionsCommand): Promise<void> {
    await recordMandateOptions(companyId, payload, {
      accounts: this.accounts,
      mandates: this.mandates,
      clock: this.clock,
      events: this.events,
      uow: this.uow,
      notifier: this.notifier,
    });
  }
}
