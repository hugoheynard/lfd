/**
 * **La clôture enregistrée** : la `cycle_closes_at` du dernier lot vivant
 * (non annulé). Plan `lot-de-prelevement-fige.md` — c'est elle que
 * `cycleAt` reçoit enfin, au lieu de `null`.
 */
export abstract class RecordedClosureReader {
  /**
   * @param legalEntityId l'entité, ou `null` pour toutes : le cycle courant du
   *        tableau de bord n'en nomme aucune, et une seule entité encaisse (Q4).
   */
  abstract lastClosure(legalEntityId: string | null): Promise<Date | null>;
}
