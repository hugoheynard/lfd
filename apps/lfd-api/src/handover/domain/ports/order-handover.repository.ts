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

  // ⚠️ `referencesAttestedSince` VIVAIT ICI, et le fournil l'appelait en direct.
  // Elle est partie dans `production/channels/handover/` le 2026-09-10 : c'est
  // la production qui déclare ce dont elle a besoin, et l'adaptateur de la
  // remise l'implémente. Un dépôt d'écriture n'est pas une surface de lecture
  // pour un autre contexte — et le lui prêter donnait au fournil bien plus que
  // la question qu'il pose.
}
