/**
 * **Le verrou du stock du jour d'un point** (plan
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`, §11.2, lot
 * L2) : tout ce qui lit le reste pour décider — une passation sur stock, une
 * baisse d'un reçu — le prend d'abord, et deux décisions sur la même vitrine
 * se suivent au lieu de se croiser. Pris DANS l'unité de travail de
 * l'appelant, relâché à sa fin (`COMMIT` ou `ROLLBACK`).
 *
 * 🔴 **Jamais tenu avec le verrou de journée** (`ProductionDayLock`, que
 * prennent `PlanAdmissionDesk` et le guichet du fournil). La passation sur
 * stock ne prend pas le verrou de journée ; la passation fabriquée, l'arrêt du
 * plan, le retirage et le lancement d'un réassort ne prennent pas celui-ci.
 * Deux verrous qu'aucune transaction ne tient ensemble ne peuvent pas
 * s'attendre l'un l'autre en cercle : c'est ce qui exclut l'interblocage, et
 * pas un ordre de prise qu'il faudrait respecter partout. Un appelant qui
 * aurait besoin des deux dit qu'il mélange les deux circuits.
 */
export abstract class ShelfStockLock {
  /** Attend puis tient le stock de ce point pour cette journée (`AAAA-MM-JJ`). */
  abstract lock(serviceDay: string, siteId: string): Promise<void>;
}
