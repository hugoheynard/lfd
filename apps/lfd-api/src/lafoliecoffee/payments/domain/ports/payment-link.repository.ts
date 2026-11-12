import type { PaymentLink } from "../entities/payment-link.js";

/**
 * Port d'**écriture** des liens de paiement libres : charger l'agrégat, le
 * sauver. Aucune écriture ciblée — le statut ne bouge que par une méthode de
 * {@link PaymentLink}.
 */
export abstract class PaymentLinkRepository {
  abstract load(id: string): Promise<PaymentLink | null>;

  /**
   * Le lien, SOUS LE VERROU DE SA LIGNE, dans l'unité de travail de
   * l'appelant : une annulation et un paiement qui se croisent se jouent l'un
   * après l'autre, et le second décide sur l'état écrit par le premier — sans
   * quoi le dernier à écrire effaçait l'autre (un paiement reçu rangé
   * « annulé »). Hors d'une unité de travail, refus technique.
   */
  abstract loadLocked(id: string): Promise<PaymentLink | null>;

  /** Le lien derrière une session Stripe — la clé de rapprochement du webhook. */
  abstract loadBySession(sessionId: string): Promise<PaymentLink | null>;

  /** Comme {@link loadLocked}, par la session Stripe — pour le webhook. */
  abstract loadBySessionLocked(sessionId: string): Promise<PaymentLink | null>;

  /**
   * Création ou mise à jour, selon que l'id existe pour cette société ; un id déjà
   * pris par un autre est refusé, jamais réécrit (2026-10-07).
   */
  abstract save(link: PaymentLink): Promise<void>;
}
