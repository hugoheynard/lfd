import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { BankAccountBoundToActiveMandateError } from "../../domain/errors/mandate-errors.js";
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
 * 🔴 **Refusé en 409 tant qu'un mandat est actif**, comme le client (décidé par
 * Hugo le 2026-09-15, plan `documentation/comptabilite/plan-restes-du-mandat.md`
 * §8). L'amendement d'un mandat actif attend la réponse de la banque ; d'ici là,
 * le seul chemin est de révoquer, recopier le RIB, et frapper un nouveau mandat.
 * Même garde que `SetMyCompanyBankAccountHandler`, message écrit pour le staff.
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
    private readonly store: DocumentStore,
  ) {}

  async execute({ companyId, payload }: SetCompanyBankAccountCommand): Promise<void> {
    const current = await this.mandates.findCurrent(companyId);
    if (current?.debitable() === true) {
      throw new BankAccountBoundToActiveMandateError(companyId, "staff");
    }

    await recordCompanyBankAccount(companyId, payload, "staff", {
      accounts: this.accounts,
      ids: this.ids,
      mandates: this.mandates,
      clock: this.clock,
      events: this.events,
      uow: this.uow,
      notifier: this.notifier,
      store: this.store,
    });
  }
}
