import type { ServiceRange } from "../value-objects/service-range.value-object.js";

/** Un article que le fournil a eu à faire, sous le nom figé à l'arrêt. */
export interface KnownArticle {
  readonly sku: string;
  readonly productName: string;
}

/**
 * **« Quels articles les journées arrêtées de cette plage portaient-elles ? »**
 * — le SKU et le nom des lignes de commande ET de réassort des seules
 * journées CLOSES (plan `fournil/plan-postes-du-fournil.md`, § 3.8 et
 * § 3.10). Chaque SKU une fois : la page Postes marque ce qui a été commandé
 * ces jours-ci, l'alerte compte les produits du jour à ranger.
 *
 * Deux requêtes `DISTINCT` sur la plage, jamais les journées chargées.
 */
export abstract class KnownArticles {
  abstract between(range: ServiceRange): Promise<readonly KnownArticle[]>;
}
