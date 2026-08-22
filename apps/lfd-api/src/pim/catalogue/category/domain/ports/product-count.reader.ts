/**
 * **Combien de fiches vivantes une famille porte** — une lecture, pas un dépôt.
 *
 * Ces deux méthodes vivaient sur `CategoryRepository`, c'est-à-dire sur le port
 * par lequel le domaine des familles parle de SA persistance. Elles
 * interrogeaient la table des produits. Trois conséquences, toutes payées :
 * le port devenait impossible à implémenter sans connaître les produits, tout
 * double de test devait feindre les deux, et le jour où `status` gagne une
 * quatrième valeur, la définition de « active » changeait en silence pour
 * l'archivage.
 *
 * Le découpage est celui d'`EmplacementUsageReader`, à côté : un port dédié
 * qui répond à une question posée sur un AUTRE agrégat, sans que le dépôt de
 * celui-ci ait à le savoir.
 */
export abstract class ProductCountReader {
  /** Pour UNE famille — l'invariant d'archivage. */
  abstract countForCategory(categoryId: string): Promise<number>;

  /**
   * Pour TOUTES, en une requête — la lecture de liste.
   *
   * Les familles sans fiche active sont **absentes** de la table : un lecteur
   * lit `?? 0`, il ne suppose pas la présence de la clé. Appeler la version
   * unitaire en boucle ferait N requêtes pour peupler un tableau.
   */
  abstract countByCategory(): Promise<ReadonlyMap<string, number>>;
}
