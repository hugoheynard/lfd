/**
 * **« Quelles journées ont leur plan arrêté ? »** — port de LECTURE que le
 * fournil déclare et implémente, pour le commerce (plan
 * `documentation/commandes/plan-reglages-commandes.md`, §8, point 3, lot O3).
 *
 * Un plan arrêté (`production_day.closed_at` posé) ne prend plus de commande :
 * la boutique ne propose plus ce jour, et la passation le refuse d'avance. Sans
 * verrou, la réponse peut vieillir d'un instant : elle sert à proposer et à
 * refuser TÔT, jamais à admettre — l'admission se reprend sous le verrou de la
 * journée par {@link PlanAdmissionDesk}.
 *
 * Distinct du guichet (ISP) : la boutique qui propose un jour n'a rien à
 * verrouiller. Une journée retirée (« retirage ») reste arrêtée.
 */
export abstract class ClosedPlansReader {
  /**
   * Les journées `AAAA-MM-JJ` de `from` à `to` (compris) dont le plan est
   * arrêté, dans l'ordre. Une journée sans ligne n'est jamais arrêtée.
   */
  abstract closedBetween(from: string, to: string): Promise<readonly string[]>;
}
