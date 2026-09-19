import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { FieldCipher } from "../../../../platform/crypto/field-cipher.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { attachProofToDraft } from "../mandate-proof-support.js";
import { AttachMandateProofCommand } from "./attach-mandate-proof.command.js";

/**
 * Dépose le mandat signé scanné, depuis le back-office — **sur le brouillon
 * seulement**.
 *
 * La séquence — refuser avant de ranger, clé neuve par dépôt, référence et fait
 * au journal dans la même transaction — vit dans `attachProofToDraft`, partagée
 * avec le client depuis le 2026-09-14. Pas de cloche ici : c'est l'équipe qui
 * dépose.
 *
 * `@hors-transaction` le fichier part au stockage objet avant la transaction.
 */
@CommandHandler(AttachMandateProofCommand)
export class AttachMandateProofHandler implements ICommandHandler<AttachMandateProofCommand, void> {
  constructor(
    private readonly mandates: PaymentMandateRepository,
    private readonly store: DocumentStore,
    private readonly cipher: FieldCipher,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AttachMandateProofCommand): Promise<void> {
    await attachProofToDraft(
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
        via: "staff",
      },
    );
  }
}
