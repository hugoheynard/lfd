import type { OrderHandover } from "../entities/order-handover.js";

/**
 * **Les attestations de remise du fournil** — les lire, en graver une.
 *
 * Un port étroit : deux méthodes, pas un CRUD. La remise n'a pas de cycle de vie
 * — elle arrive une fois et ne bouge plus. Il n'y a donc rien à mettre à jour,
 * et surtout rien à supprimer : une attestation qu'on peut retirer n'atteste
 * plus rien.
 */
export abstract class OrderHandoverRepository {
  /** L'attestation de cette commande, ou `null` si elle reste à faire. */
  abstract findByOrderId(orderId: string): Promise<OrderHandover | null>;

  /**
   * Grave l'attestation. Rend `false` si une autre était déjà là.
   *
   * ⚠️ Le booléen n'est pas une pré-vérification déguisée : la contrainte
   * d'unicité tranche **dans la base**, donc deux postes qui scannent le même QR
   * au même instant produisent exactement une remise, et le perdant l'apprend
   * ici. Une lecture-puis-écriture aurait laissé passer les deux.
   */
  abstract attest(handover: OrderHandover): Promise<boolean>;
}
