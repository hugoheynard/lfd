import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { CompanyBankAccountNotFoundError } from "../../domain/errors/mandate-errors.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { MandateOptions } from "../../domain/value-objects/mandate-options.js";
import { writeVoidingDraft } from "../draft-mandate-voiding.js";
import { ringDraftVoided } from "../mandate-staff-bell.js";
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
 * ## Le brouillon en cours devient caduc (depuis le 2026-09-14)
 *
 * Les zones 14 et 19 sont imprimées : un brouillon signé après leur réécriture
 * porterait l'ancienne version. Il est révoqué dans la même unité de travail,
 * et l'équipe prévenue ensuite (plan mandat client §9 #4).
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
    const account = await this.accounts.findByCompany(companyId);
    if (account === null) {
      throw new CompanyBankAccountNotFoundError(companyId);
    }

    account.setOptions(MandateOptions.create(payload));
    const voided = await writeVoidingDraft(
      { mandates: this.mandates, clock: this.clock, events: this.events, uow: this.uow },
      companyId,
      "mandate_options_changed",
      () => this.accounts.save(account),
    );
    if (voided !== null) {
      await ringDraftVoided(
        { notifier: this.notifier, mandates: this.mandates, clock: this.clock },
        voided,
        "mandate_options_changed",
      );
    }
  }
}
