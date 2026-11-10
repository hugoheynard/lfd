import type { VitrineDelivery } from "../vitrine-delivery.js";

/** Port d'écriture des livraisons. */
export abstract class VitrineDeliveryRepository {
  abstract load(id: string): Promise<VitrineDelivery | null>;
  abstract save(delivery: VitrineDelivery): Promise<void>;
  /** LA livraison de changements en attente de cet abonné, s'il y en a une (il n'y en a jamais deux). */
  abstract pendingChangeOf(subscriberId: string): Promise<VitrineDelivery | null>;
  /** Les livraisons en attente dont l'essai est dû, les plus anciennes d'abord. */
  abstract listDue(now: Date, limit: number): Promise<readonly VitrineDelivery[]>;
}
