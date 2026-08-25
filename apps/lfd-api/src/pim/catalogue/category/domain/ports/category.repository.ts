import type { WriteTicket } from "../../../../journal/pim-journal.js";
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
  /**
   * La famille qui porte ce slug français, s'il y en a une — **archivées
   * comprises**.
   *
   * Le slug est dérivé du nom, jamais saisi, et sert d'identifiant en aval :
   * préfixe de famille de tous les SKU, et clé projetée vers le catalogue B2B.
   * Deux familles qui le partagent, c'est un identifiant qui cesse
   * d'identifier. Les archivées comptent : elles gardent leurs fiches, donc
   * leur préfixe de SKU reste pris.
   */
  abstract findBySlugFr(slugFr: string): Promise<Category | null>;
  abstract listAll(): Promise<Category[]>;
  /**
   * Les familles d'UN niveau, rangées. Réordonner ou renuméroter une fratrie
   * chargeait l'arbre entier pour en garder une poignée.
   */
  abstract listChildren(parentId: string | null): Promise<Category[]>;
  abstract add(category: Category, ticket: WriteTicket): Promise<void>;
  abstract save(category: Category, ticket: WriteTicket): Promise<void>;
  /** Écrit plusieurs familles **en une transaction** — le réordonnancement. */
  abstract saveAll(categories: readonly Category[], ticket: WriteTicket): Promise<void>;
  /**
   * Combien de sous-familles **vivantes** ce parent porte — l'invariant
   * d'archivage. C'est bien une question sur les familles, donc elle est ici ;
   * le compte de FICHES, lui, a son propre port (`ProductCountReader`).
   */
  abstract countActiveChildren(parentId: string): Promise<number>;
  abstract nextPosition(parentId: string | null): Promise<number>;
}
