import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { ProductionDocumentStore } from "../../../platform/storage/production-document-store.js";
import { HandoverSubjectReader } from "../../channels/commerce/handover-subject.reader.js";
import type { HandoverProof } from "../../domain/entities/handover-proof.js";
import {
  type HandoverProofErasureCause,
  HandoverProofErasedEvent,
} from "../../domain/events/handover-proof-erased.event.js";
import { HandoverProofEraser } from "../../domain/ports/handover-proof.eraser.js";

/**
 * **Effacer UNE pièce de remise** — la séquence que la purge et l'effacement
 * à la demande partagent, pour qu'il n'y ait qu'un ordre à tenir.
 *
 * 1. Les images d'ABORD, hors transaction : `delete` est idempotent (une clé
 *    absente est un succès). Si le stockage refuse, l'erreur remonte et la
 *    ligne RESTE — c'est elle qui porte les clés ; l'effacer d'abord laisserait
 *    des images orphelines que plus rien ne retrouve. Rejouer reprend tout.
 * 2. Puis, dans UNE unité de travail, la ligne et son fait au journal : pas de
 *    ligne effacée sans trace, pas de trace sans ligne effacée. Si le journal
 *    refuse, la ligne revient et les images sont déjà parties — rejouer
 *    retire des clés absentes (succès), puis écrit la ligne et le fait.
 *
 * Une ligne déjà effacée par un passage concurrent n'écrit aucun fait : celui
 * qui l'a effacée a écrit le sien.
 */
@Injectable()
export class HandoverProofErasure {
  constructor(
    private readonly eraser: HandoverProofEraser,
    private readonly store: ProductionDocumentStore,
    private readonly subjects: HandoverSubjectReader,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /** @throws {DocumentStorageUnavailableError} une image n'a pas pu être retirée. */
  async erase(proof: HandoverProof, cause: HandoverProofErasureCause): Promise<void> {
    for (const key of proof.imageKeys()) {
      await this.store.delete(key);
    }
    const subject = await this.subjects.byOrderId(proof.state.orderId);
    await this.uow.run(async () => {
      if (await this.eraser.erase(proof.state.orderId)) {
        await this.events.publishTraced(
          new HandoverProofErasedEvent(proof, subject?.orderNumber ?? null, cause),
        );
      }
    });
  }
}
