/**
 * **Ce que le balayage reprend** (plan M2, §3.5, §6.8) — une lecture, sans
 * verrou : ce qu'elle rend oriente, l'exécuteur relit sous son bail.
 */
export abstract class CardRefundSweepReader {
  /**
   * Les demandes `to_issue` dont l'échéance est passée à `wallNow`, par ordre
   * d'échéance, au plus `limit`.
   */
  abstract dueForSweep(wallNow: Date, limit: number): Promise<readonly string[]>;
}
