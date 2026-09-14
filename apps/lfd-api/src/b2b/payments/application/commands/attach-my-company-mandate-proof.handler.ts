import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { FieldCipher } from "../../../../platform/crypto/field-cipher.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { BankAccountGuardReader } from "../../domain/ports/bank-account-guard.reader.js";
import { CustomerMandateGate } from "../../domain/ports/customer-mandate-gate.js";
import { ensureCustomerMandateAccess } from "../customer-mandate-access.js";
import { attachProofToDraft } from "../mandate-proof-support.js";
import { ringProofDeposited } from "../mandate-staff-bell.js";
import { AttachMyCompanyMandateProofCommand } from "./attach-my-company-mandate-proof.command.js";

/**
 * Dépose le scan signé du client — **sur le brouillon seulement**, après le mur
 * et le drapeau.
 *
 * La séquence est celle du staff (`attachProofToDraft`) : refus hors brouillon
 * AVANT le rangement, clé neuve par dépôt, fait au journal dans la transaction
 * de l'écriture. Ce qui s'ajoute ici est la **cloche** : sans elle, la pièce
 * dort jusqu'à ce que quelqu'un ouvre la fiche par hasard. Elle sonne après,
 * hors transaction, et une cloche en panne n'annule pas le dépôt.
 *
 * `@hors-transaction` le fichier part au stockage objet avant la transaction.
 */
@CommandHandler(AttachMyCompanyMandateProofCommand)
export class AttachMyCompanyMandateProofHandler implements ICommandHandler<
  AttachMyCompanyMandateProofCommand,
  void
> {
  constructor(
    private readonly guard: BankAccountGuardReader,
    private readonly gate: CustomerMandateGate,
    private readonly mandates: PaymentMandateRepository,
    private readonly store: DocumentStore,
    private readonly cipher: FieldCipher,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly notifier: StaffNotifier,
  ) {}

  async execute(command: AttachMyCompanyMandateProofCommand): Promise<void> {
    await ensureCustomerMandateAccess(
      { guard: this.guard, gate: this.gate },
      command.actorUserId,
      command.companyId,
    );

    const mandate = await attachProofToDraft(
      {
        mandates: this.mandates,
        store: this.store,
        cipher: this.cipher,
        clock: this.clock,
        events: this.events,
        uow: this.uow,
      },
      {
        companyId: command.companyId,
        fileName: command.fileName,
        bytes: command.bytes,
        via: "customer",
      },
    );
    await ringProofDeposited(
      { notifier: this.notifier, mandates: this.mandates, clock: this.clock },
      mandate,
    );
  }
}
