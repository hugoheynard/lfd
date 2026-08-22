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
  /**
   * Combien de sous-familles **vivantes** ce parent porte — l'invariant
   * d'archivage. C'est bien une question sur les familles, donc elle est ici ;
   * le compte de FICHES, lui, a son propre port (`ProductCountReader`).
   */
  abstract countActiveChildren(parentId: string): Promise<number>;
  abstract nextPosition(parentId: string | null): Promise<number>;
}
