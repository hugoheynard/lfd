import type { ShipmentRef } from "../../../production/channels/handover/index.js";
import type { HandoverProof } from "../entities/handover-proof.js";

/**
 * **Les pièces des remises à la porte** (`a-la-porte.md`, B1, L6-C9) —
 * les graver avec l'attestation, et les retrouver au rejeu du livreur.
 *
 * Comme l'attestation : rien à mettre à jour, rien à supprimer par ce port —
 * une pièce qu'on peut retirer en passant ne prouve plus rien. L'effacement
 * délibéré (conservation échue, demande d'une personne) a son port à lui,
 * `HandoverProofEraser`, que le geste qui grave n'injecte pas.
 */
export abstract class HandoverProofRepository {
  /**
   * Les pièces de cet envoi `(commande, rang)` (L4b), ou `null` : il n'a pas
   * été remis à la porte.
   */
  abstract findByShipment(shipment: ShipmentRef): Promise<HandoverProof | null>;

  /**
   * Les pièces de TOUS les envois de cette commande, par rang croissant —
   * l'effacement à la demande d'une personne vise la commande, reliquats
   * compris (L4b). Vide : rien n'a été remis à la porte.
   */
  abstract findAllOfOrder(orderId: string): Promise<readonly HandoverProof[]>;

  /** Grave les pièces, dans la transaction ambiante — celle de l'attestation. */
  abstract record(proof: HandoverProof): Promise<void>;
}
