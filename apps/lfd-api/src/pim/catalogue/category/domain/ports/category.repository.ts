import type { Category } from "../entities/category.js";

/**
 * Port : le domaine dépend de cette abstraction, jamais de Prisma.
 *
 * Il ne porte plus une méthode par mutation (`rename`, `archive`,
 * `setChannels`…) : c'était au dépôt de savoir ce qu'un verbe change, donc à
 * lui de rester d'accord avec le domaine. Il rend et reprend l'**agrégat** ;
 * ce que le verbe a modifié, l'agrégat le sait, et le dépôt ne fait qu'écrire
 * l'état qu'on lui tend.
 */
export abstract class CategoryRepository {
  abstract findById(id: string): Promise<Category | null>;
  abstract listAll(): Promise<Category[]>;
  abstract add(category: Category): Promise<void>;
  abstract save(category: Category): Promise<void>;
  /** Écrit plusieurs familles **en une transaction** — le réordonnancement. */
  abstract saveAll(categories: readonly Category[]): Promise<void>;
  abstract countActiveProducts(id: string): Promise<number>;
  /**
   * Le compte de fiches actives **par famille**, en une requête.
   *
   * Séparé de `countActiveProducts` volontairement : la version unitaire garde
   * un invariant à l'écriture (peut-on archiver celle-ci ?), celle-ci sert une
   * LECTURE de liste. Les appeler en boucle ferait N requêtes pour peupler un
   * tableau.
   *
   * Les familles sans fiche active sont **absentes** de la table — un lecteur
   * lit `?? 0`, il ne suppose pas la présence de la clé.
   */
  abstract activeProductCounts(): Promise<ReadonlyMap<string, number>>;
  abstract nextPosition(parentId: string | null): Promise<number>;
}
