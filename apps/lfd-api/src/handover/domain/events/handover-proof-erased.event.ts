import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { HandoverProof } from "../entities/handover-proof.js";

/** Pourquoi des pièces partent : la conservation échue, ou une demande. */
export type HandoverProofErasureCause = "retention" | "request";

/**
 * **Les pièces d'une remise à la porte, effacées.** Sujet : la commande, nommée
 * par son numéro quand le commerce la connaît encore.
 *
 * 🔴 Ni le nom du réceptionnaire, ni les clés d'image : effacer une donnée
 * personnelle pour la recopier au journal n'effacerait rien.
 */
export class HandoverProofErasedEvent implements JournaledEvent {
  constructor(
    readonly proof: HandoverProof,
    readonly orderNumber: string | null,
    readonly cause: HandoverProofErasureCause,
  ) {}

  journalFact(): JournalFact {
    const { orderId, recordedAt, signatureKey } = this.proof.state;
    return {
      type: "order_handover_proof.erased",
      subjectType: "order",
      subjectId: orderId,
      payload: {
        ...(this.orderNumber === null ? {} : { subjectLabel: this.orderNumber }),
        recordedAt: recordedAt.toISOString(),
        signed: signatureKey !== null,
        cause: this.cause,
      },
    };
  }
}
