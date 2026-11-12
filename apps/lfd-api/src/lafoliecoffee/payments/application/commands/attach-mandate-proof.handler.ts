import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { FieldCipher } from "../../../../platform/crypto/field-cipher.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { attachProofToDraft } from "../mandate-proof-support.js";
import { AttachMandateProofCommand } from "./attach-mandate-proof.command.js";
import { SiteGesturePublisher } from "../../../account/application/services/site-gesture.publisher.js";

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
 *
 * **Une fois par intention** : sujet, la société. Chaque dépôt range sa pièce
 * sous une clé neuve et change la révision que la signature attend : un double
 * clic aurait rangé deux pièces et périmé la signature en cours. La même clé
 * ne redépose rien ; l'intention est scellée avec la référence écrite.
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
    private readonly gestures: SiteGesturePublisher,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: AttachMandateProofCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: ATTACH_PROOF_GESTURE,
        subject: command.companyId,
      },
      NOTHING_TO_REPLAY,
      (seal) => this.attach(command, seal),
    );
  }

  private async attach(
    command: AttachMandateProofCommand,
    seal: () => Promise<void>,
  ): Promise<void> {
    await attachProofToDraft(
      {
        mandates: this.mandates,
        store: this.store,
        cipher: this.cipher,
        clock: this.clock,
        events: this.events,
        uow: this.uow,
        gestures: this.gestures,
      },
      {
        companyId: command.companyId,
        fileName: command.fileName,
        bytes: command.bytes,
        actor: { kind: "team" },
      },
      seal,
    );
  }
}

/** Le nom stable du geste, dans le registre des intentions. */
const ATTACH_PROOF_GESTURE = "payments.attach-mandate-proof";
