/**
 * **Le verrou des transferts d'une journée** (audit du réassort, 2026-11-02).
 *
 * Deux abonnés qui rangent en même temps des éléments d'un même point et
 * d'un même jour — l'arrêt du plan et un lancement « au plus tôt », ou deux
 * lancements — lisaient chacun « aucun transfert prévu » et en ouvraient
 * chacun un : deux transferts prévus pour un seul point. La version de
 * l'agrégat ne voit rien (deux créations), l'unicité des éléments non plus
 * (deux éléments distincts). Le rangement prend donc ce verrou AVANT de lire
 * qui porte l'élément et quel transfert est prévu.
 *
 * Séparé de `InternalTransferRepository` (ISP) : seul le rangement le prend.
 */
export abstract class InternalTransferDayLock {
  /**
   * Tient les journées jusqu'à la fin de l'unité de travail de l'appelant,
   * prises dans l'ordre croissant (deux appelants ne s'attendent pas en
   * croix).
   */
  abstract hold(serviceDays: readonly string[]): Promise<void>;
}
