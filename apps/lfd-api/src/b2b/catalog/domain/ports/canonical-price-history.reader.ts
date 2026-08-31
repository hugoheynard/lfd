import type { CatalogPricing } from "@lfd/contracts";

/**
 * Port de **lecture** de l'historique du tarif canonique.
 *
 * Il n'y a **pas de port d'écriture**, et c'est délibéré : la trace est écrite
 * dans la transaction qui sauve l'article, au seul endroit par lequel les deux
 * chemins de changement passent. Un port d'écriture séparé aurait permis
 * d'écrire un prix sans sa trace — au premier oubli, à la première branche
 * d'erreur, au premier chemin de rattrapage.
 */
export abstract class CanonicalPriceHistoryReader {
  /**
   * Le tarif de chaque **produit** à cet instant : la dernière trace antérieure
   * ou égale à `at`, indexée par SKU **de produit**.
   *
   * ## Pourquoi le produit et non l'article
   *
   * Parce que c'est l'unité que la plateforme B2B **vend** :
   * `ProductCatalogReader` expose `sku: item.productSku` et résout par
   * `findDefaultByProductSku`. Les traces portent les deux SKU, et grouper par
   * article rendrait une carte que personne ne sait interroger — les appelants
   * n'ont que le SKU produit en main.
   *
   * ⚠️ **La limite, nommée** : un produit à plusieurs déclinaisons vendables
   * (l'unité et le carton de 50) n'a qu'une ligne ici, celle de la trace la plus
   * récente, quelle que soit la déclinaison dont elle vient. C'est sans effet
   * tant que la boutique vend la déclinaison par défaut — ce qu'elle fait — et
   * c'est le premier endroit à reprendre le jour où elle vendra les
   * déclinaisons. `@lfd/catalog-sync` annonce déjà cette bascule.
   *
   * Un produit absent de la table rendue n'a **aucune** trace à cette date —
   * soit qu'il n'existait pas, soit que l'historique ne remontait pas si loin.
   * L'appelant doit distinguer les deux, et c'est {@link startsAt} qui le lui
   * permet : rendre le prix d'aujourd'hui à sa place serait exactement le
   * mensonge que cet historique existe pour supprimer.
   */
  abstract pricingAt(at: Date): Promise<ReadonlyMap<string, CatalogPricing>>;

  /**
   * **Le premier instant que l'historique couvre**, ou `null` s'il est vide.
   *
   * L'histoire commence le jour où on l'écrit ; avant, il n'y a rien, et il faut
   * pouvoir le DIRE plutôt que de rendre un tableau qui aurait l'air complet.
   */
  abstract startsAt(): Promise<Date | null>;
}
