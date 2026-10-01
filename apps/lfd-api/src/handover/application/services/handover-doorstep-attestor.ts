import { Injectable } from "@nestjs/common";

import {
  DoorstepHandoverAttestor,
  type DoorstepHandoverRequest,
  type DoorstepProofImages,
  type HandoverPublication,
  type StagedHandoverProofs,
} from "../../../delivery/channels/handover/index.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { ProductionDocumentStore } from "../../../platform/storage/production-document-store.js";
import { Clock } from "../../../platform/time/clock.js";
import { HandoverSubjectReader } from "../../channels/commerce/handover-subject.reader.js";
import { HandoverProof } from "../../domain/entities/handover-proof.js";
import { HandoverRefusedError } from "../../domain/errors/handover-errors.js";
import { HandoverProofRepository } from "../../domain/ports/handover-proof.repository.js";
import { OrderHandoverRepository } from "../../domain/ports/order-handover.repository.js";
import type { HandoverVia } from "../../domain/services/handover.js";
import { HandoverAttestation } from "./handover-attestation.service.js";

/**
 * Une remise « sans code » : le livreur l'atteste seul, la signature jointe
 * quand elle est exigée (L6-C9). `deposit` est le dépôt sans personne (B2).
 */
const DOORSTEP_VIA: HandoverVia = "manual";

/** Les pièces d'une remise, sous le préfixe du retrait. */
function proofKey(stagingId: string, piece: "photo" | "signature"): string {
  return `handover/proofs/${stagingId}/${piece}`;
}

/**
 * **« Atteste cette remise à la porte »** — la réponse du retrait au canal de
 * la livraison (`plan-a-la-porte.md`, B1, § 10 bis, AP-D1, L6-C7 à C9).
 *
 * La règle est CELLE du comptoir (`HandoverAttestation`) : commande annulée,
 * pas passée, déjà retirée, retenue — refusées avec la même phrase, la course
 * tranchée par la même contrainte. Ce qui change : rien n'est publié ici, la
 * publication est rendue (AP-D1), et les pièces sont gravées avec
 * l'attestation, dans la même transaction.
 */
@Injectable()
export class HandoverDoorstepAttestor extends DoorstepHandoverAttestor {
  constructor(
    private readonly subjects: HandoverSubjectReader,
    private readonly attestation: HandoverAttestation,
    private readonly handovers: OrderHandoverRepository,
    private readonly proofs: HandoverProofRepository,
    private readonly store: ProductionDocumentStore,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    super();
  }

  async stageProofs(images: DoorstepProofImages): Promise<StagedHandoverProofs> {
    const stagingId = this.ids.next();
    const photoKey = proofKey(stagingId, "photo");
    await this.store.save(photoKey, images.photo);
    if (images.signature === null) {
      return { photoKey, signatureKey: null };
    }
    const signatureKey = proofKey(stagingId, "signature");
    try {
      await this.store.save(signatureKey, images.signature);
    } catch (error) {
      await this.store.delete(photoKey);
      throw error;
    }
    return { photoKey, signatureKey };
  }

  /** @throws {HandoverRefusedError} la commande n'est plus servie, ou l'état l'interdit. */
  async attest(request: DoorstepHandoverRequest): Promise<HandoverPublication> {
    const subject = await this.subjects.byOrderId(request.orderId);
    if (subject === null) {
      throw new HandoverRefusedError(
        "Cette commande n'existe plus côté commerce : ne la remettez pas, et appelez le dépôt.",
      );
    }
    const { publish } = await this.attestation.attestQuietly(subject, request.by, DOORSTEP_VIA);
    await this.proofs.record(
      HandoverProof.attach({
        orderId: request.orderId,
        receiverName: request.receiverName,
        photoKey: request.proofs.photoKey,
        signatureKey: request.proofs.signatureKey,
        recordedBy: request.by,
        recordedAt: this.clock.now(),
      }),
    );
    return publish;
  }

  async republication(orderId: string): Promise<HandoverPublication | null> {
    const [proof, handover] = await Promise.all([
      this.proofs.findByOrderId(orderId),
      this.handovers.findByOrderId(orderId),
    ]);
    return proof === null || handover === null ? null : this.attestation.publicationOf(handover);
  }

  async discardProofs(staged: StagedHandoverProofs): Promise<void> {
    await this.store.delete(staged.photoKey);
    if (staged.signatureKey !== null) {
      await this.store.delete(staged.signatureKey);
    }
  }
}
