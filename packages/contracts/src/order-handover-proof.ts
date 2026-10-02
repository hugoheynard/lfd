/**
 * **La preuve d'une remise à la porte, vue du staff** — ce qu'on montre pour
 * répondre à une contestation (`documentation/livraisons/plan-a-la-porte.md`,
 * § 10, lot « voir les preuves »).
 *
 * Aucune clé de stockage ne traverse : les images se demandent par la
 * commande (`GET admin/orders/:id/preuve-livraison/photo|signature`), et le
 * serveur retrouve lui-même la pièce de CETTE commande.
 */
import type { StaffPermission } from "./staff-access.js";

/**
 * **Le droit de voir une preuve de livraison** — `delivery_proofs:read`, sorti
 * de `b2b_orders:read` le 2026-10-02 (lot « correctifs de droits ») : il garde
 * les trois routes `preuve-livraison` et la carte de la fiche commande.
 * `write` n'ouvre rien aujourd'hui.
 */
export const DELIVERY_PROOF_PERMISSION = "delivery_proofs:read" as const satisfies StaffPermission;

export interface OrderHandoverProofView {
  /** `handed` : remis en main propre ; `deposited` : déposé sans personne. */
  readonly mode: OrderHandoverProofMode;
  /** L'instant de l'attestation, ISO 8601. */
  readonly handedOverAt: string;
  /** Le livreur, nommé par l'annuaire ; `null` si la fiche n'est plus lisible. */
  readonly courierName: string | null;
  /**
   * Les pièces, ou `null` : la remise est attestée mais ses pièces ont été
   * effacées (conservation échue, demande d'une personne).
   */
  readonly pieces: OrderHandoverProofPieces | null;
}

export type OrderHandoverProofMode = "handed" | "deposited";

export interface OrderHandoverProofPieces {
  /** Le nom tapé de qui a réceptionné ; `null` pour un dépôt. */
  readonly receiverName: string | null;
  /** Une photo est toujours jointe : une remise à la porte sans photo n'existe pas. */
  readonly hasSignature: boolean;
}

/** La réponse de la route : `proof` vaut `null` quand la commande n'a pas été remise à la porte. */
export interface OrderHandoverProofResponse {
  readonly proof: OrderHandoverProofView | null;
}
