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
   * Le tarif de chaque **article** à cet instant : la dernière trace antérieure
   * ou égale à `at`, indexée par SKU **de vente** — celui de la déclinaison.
   *
   * ## Pourquoi l'article, et plus le produit
   *
   * Parce que c'est l'unité que la plateforme **vend** : depuis la bascule du
   * 2026-10-29 (`plan-defaut-sous-sa-reference.md`, L3), toute déclinaison se
   * vend sous sa propre référence (`shopSkuOf`), le défaut compris. L'index
   * était le SKU produit tant que le défaut se vendait sous lui ; il rendait
   * alors une ligne par produit, celle de la trace la plus récente quelle que
   * soit la déclinaison. Les traces portent les deux SKU depuis leur première
   * écriture : rien n'est à reprendre, et une déclinaison montrée en vignette
   * a désormais son propre historique.
   *
   * Un article absent de la table rendue n'a **aucune** trace à cette date —
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
