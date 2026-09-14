import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { MandateOptionsBoundToActiveMandateError } from "../../domain/errors/mandate-errors.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { BankAccountGuardReader } from "../../domain/ports/bank-account-guard.reader.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { CustomerMandateGate } from "../../domain/ports/customer-mandate-gate.js";
import { ensureCustomerMandateAccess } from "../customer-mandate-access.js";
import { recordMandateOptions } from "./record-mandate-options.js";
import { SetMyCompanyMandateOptionsCommand } from "./set-my-company-mandate-options.command.js";

/**
 * Le client pose les zones 14 et 19 — la séquence est celle du staff, partagée.
 *
 * Ordre : mur (404/403) → drapeau (409) → RIB (404) → **actif** (409) →
 * écriture, brouillon rendu caduc, cloche.
 *
 * 🔴 **Refusé en 409 sous un mandat actif** : les zones sont imprimées sur un
 * papier déjà signé, et le changement de papier passe par le staff — la même
 * règle que le RIB client (plan §8). Un brouillon, lui, ne bloque rien : il est
 * révoqué par l'écriture, et le client régénère.
 */
@CommandHandler(SetMyCompanyMandateOptionsCommand)
export class SetMyCompanyMandateOptionsHandler implements ICommandHandler<
  SetMyCompanyMandateOptionsCommand,
  void
> {
  constructor(
    private readonly guard: BankAccountGuardReader,
    private readonly gate: CustomerMandateGate,
    private readonly accounts: CompanyBankAccountRepository,
    private readonly mandates: PaymentMandateRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly notifier: StaffNotifier,
  ) {}

  async execute({
    actorUserId,
    companyId,
    payload,
  }: SetMyCompanyMandateOptionsCommand): Promise<void> {
    await ensureCustomerMandateAccess(
      { guard: this.guard, gate: this.gate },
      actorUserId,
      companyId,
    );

    await recordMandateOptions(
      companyId,
      payload,
      "customer",
      {
        accounts: this.accounts,
        mandates: this.mandates,
        clock: this.clock,
        events: this.events,
        uow: this.uow,
        notifier: this.notifier,
      },
      () => this.refuseUnderActiveMandate(companyId),
    );
  }

  private async refuseUnderActiveMandate(companyId: string): Promise<void> {
    const current = await this.mandates.findCurrent(companyId);
    if (current?.debitable() === true) {
      throw new MandateOptionsBoundToActiveMandateError(companyId);
    }
  }
}
