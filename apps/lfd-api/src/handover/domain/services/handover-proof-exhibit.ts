import type { HandoverProof } from "../entities/handover-proof.js";
import type { OrderHandover } from "../entities/order-handover.js";

/** `handed` : remis en main propre ; `deposited` : déposé, personne n'a réceptionné. */
export type HandoverProofMode = "handed" | "deposited";

/** Les pièces encore là : le nom de qui a réceptionné, et si une signature est jointe. */
export interface HandoverProofPieces {
  readonly receiverName: string | null;
  readonly hasSignature: boolean;
}

/**
 * **Ce qu'on montre d'une remise à la porte** — sans aucune clé de stockage :
 * les images se redemandent par la commande, jamais par une clé.
 */
export interface HandoverProofExhibit {
  readonly mode: HandoverProofMode;
  readonly handedOverAt: Date;
  /** La fiche staff qui a attesté — un identifiant, que le lecteur nomme par l'annuaire. */
  readonly handedOverBy: string;
  /** `null` : la remise est attestée, ses pièces ont été effacées. */
  readonly pieces: HandoverProofPieces | null;
}

/** Ce que le retrait sait d'une commande attestée, pour en tirer la preuve. */
export interface HandoverProofRecord {
  readonly handover: OrderHandover;
  readonly proof: HandoverProof | null;
  /** Partie en tournée et pas rapportée : une remise `manual` y a eu lieu à la porte. */
  readonly departedWithRound: boolean;
}

/**
 * **La preuve à montrer, ou `null` : rien à montrer.**
 *
 * Une attestation sans pièce est ambiguë, et c'est ici qu'elle se tranche :
 *
 * - un `deposit` a TOUJOURS eu sa photo (B2) — sans pièce, elle a été effacée ;
 * - un `manual` d'une commande partie en tournée est une remise à la porte
 *   (B1) — sans pièce, effacée aussi ;
 * - un `manual` au comptoir, ou un `scan`, n'en a jamais eu : rien à montrer.
 *
 * ⚠️ Le second cas suppose qu'une commande partie ne se retire pas au
 * comptoir sans être d'abord rapportée — vrai tant que le 6 c (relivrer,
 * retirer au comptoir) n'existe pas (`todo-la-porte.md`, vérifié le
 * 2026-10-02).
 */
export function handoverProofExhibit(record: HandoverProofRecord): HandoverProofExhibit | null {
  const { handover, proof } = record;
  const mode: HandoverProofMode =
    handover.via === "deposit" || proof?.state.receiverName === null ? "deposited" : "handed";
  if (proof !== null) {
    return {
      mode,
      handedOverAt: handover.handedOverAt,
      handedOverBy: handover.handedOverBy,
      pieces: {
        receiverName: proof.state.receiverName,
        hasSignature: proof.state.signatureKey !== null,
      },
    };
  }
  const hadPieces =
    handover.via === "deposit" || (handover.via === "manual" && record.departedWithRound);
  return hadPieces
    ? {
        mode,
        handedOverAt: handover.handedOverAt,
        handedOverBy: handover.handedOverBy,
        pieces: null,
      }
    : null;
}
