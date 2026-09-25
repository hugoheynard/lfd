import type { PaymentLink } from "../entities/payment-link.js";

/**
 * Port d'**écriture** des liens de paiement libres : charger l'agrégat, le
 * sauver. Aucune écriture ciblée — le statut ne bouge que par une méthode de
 * {@link PaymentLink}.
 */
export abstract class PaymentLinkRepository {
  abstract load(id: string): Promise<PaymentLink | null>;

  /** Le lien derrière une session Stripe — la clé de rapprochement du webhook. */
  abstract loadBySession(sessionId: string): Promise<PaymentLink | null>;

  /** Création ou mise à jour, selon que l'id existe. */
  abstract save(link: PaymentLink): Promise<void>;
}
