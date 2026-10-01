import type { HandoverProof } from "../entities/handover-proof.js";

/**
 * **Les pièces des remises à la porte** (`plan-a-la-porte.md`, B1, L6-C9) —
 * les graver avec l'attestation, et les retrouver au rejeu du livreur.
 *
 * Comme l'attestation : rien à mettre à jour, rien à supprimer par ce port —
 * une pièce qu'on peut retirer en passant ne prouve plus rien. L'effacement
 * délibéré (conservation échue, demande d'une personne) a son port à lui,
 * `HandoverProofEraser`, que le geste qui grave n'injecte pas.
 */
export abstract class HandoverProofRepository {
  /** Les pièces de cette commande, ou `null` : elle n'a pas été remise à la porte. */
  abstract findByOrderId(orderId: string): Promise<HandoverProof | null>;

  /** Grave les pièces, dans la transaction ambiante — celle de l'attestation. */
  abstract record(proof: HandoverProof): Promise<void>;
}
