import type { ProviderCheckSelection } from "../services/provider-check-schedule.js";

/**
 * **Les paiements en attente à relire chez le prestataire** (plan B, §2.1) —
 * une lecture, sans verrou : ce qu'elle rend oriente, `settleFromProvider`
 * relit chaque ligne. Séparée du dépôt (ISP) : le balayage est seul à la lire.
 */
export abstract class PendingCardPaymentsReader {
  /**
   * Les paiements `pending | failed`, rattachés à une référence, hors rôle
   * `complement`, dus selon `selection` — les moins récemment relus d'abord
   * (jamais relus en tête), au plus `selection.limit`. Rend leurs identifiants.
   */
  abstract dueForProviderCheck(selection: ProviderCheckSelection): Promise<readonly string[]>;
}
