/**
 * **Relit chez le prestataire les paiements restés en attente** (plan B,
 * §2.1, §2.3) — le filet d'un webhook perdu. Émise par le cron de
 * rafraîchissement, jamais par un client.
 */
export class SweepPendingCardPaymentsCommand {}

/** Ce que le passage a constaté, ligne par ligne (une issue par paiement examiné). */
export interface PendingCardPaymentsSweepReport {
  readonly examined: number;
  /** Encaissés, et réglés par le chemin du webhook. */
  readonly settled: number;
  /** Encaissés, mais la ligne l'était déjà (un webhook arrivé entre-temps). */
  readonly replayed: number;
  /** Encaissés, refusés par le sujet (une commande annulée) : le remboursement suit son chemin. */
  readonly refusedBySubject: number;
  /** Annulés chez le prestataire : la ligne est fermée. */
  readonly closed: number;
  /** Rien de décidé : relus au prochain intervalle. */
  readonly pending: number;
  /** La relecture a échoué (prestataire, sujet) : relus au prochain intervalle. */
  readonly failedChecks: number;
}
