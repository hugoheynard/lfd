import { Injectable } from "@nestjs/common";

import { orderLimitChanges } from "../domain/order-limit-descent.js";
import { CatalogOrderLimits } from "../domain/ports/catalog-order-limits.js";

/**
 * **Redescend les limites de commande** sur les articles en vente, depuis
 * l'échelle reçue du référentiel (lot 2b de
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`).
 *
 * Appelé par les trois récepteurs des faits du catalogue, chacun après son
 * écriture et seulement si elle a eu lieu :
 *
 * - le fait des **règles** : tous les articles ;
 * - le fait d'une **fiche** : ses articles — un article neuf reçoit ses
 *   limites résolues, un article reclassé celles de sa nouvelle famille ;
 * - le fait d'une **famille** : tous les articles — une famille déplacée
 *   change la lignée de toutes ses descendantes.
 *
 * ⚠️ **Aucune échelle reçue = rien ne bouge.** Avant le premier fait de
 * règles, les limites posées par le push restent ; les effacer ici rendrait
 * muette la seule règle qui refuse une commande en retard.
 */
@Injectable()
export class OrderLimitsRefresher {
  constructor(private readonly limits: CatalogOrderLimits) {}

  /** `productId` = les articles d'une fiche ; `null` = tous. */
  async refresh(productId: string | null): Promise<void> {
    const rules = await this.limits.rules();
    if (rules === null) {
      return;
    }
    const [categories, targets] = await Promise.all([
      this.limits.categories(),
      this.limits.targets(productId),
    ]);
    const changes = orderLimitChanges(rules, categories, targets);
    if (changes.length > 0) {
      await this.limits.write(changes);
    }
  }
}
