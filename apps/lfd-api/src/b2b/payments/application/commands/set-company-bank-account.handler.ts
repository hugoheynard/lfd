import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
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
 * propre, la surface staff le pose en amont. Elle révoque aussi le brouillon de
 * mandat en cours (2026-09-14).
 *
 * ⚠️ Un mandat ACTIF dont le staff change le compte n'a encore aucun mécanisme :
 * hors lot, écrit dans `todo-mandat-core-contre-b2b.md` (plan §9 #5).
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
    private readonly mandates: PaymentMandateRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly notifier: StaffNotifier,
  ) {}

  async execute({ companyId, payload }: SetCompanyBankAccountCommand): Promise<void> {
    await recordCompanyBankAccount(companyId, payload, {
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
