import type { WriteTicket } from "../../../journal/pim-journal.js";
import type { PointOfSale } from "../entities/point-of-sale.js";

/**
 * Port : l'application dépend de cette abstraction, jamais de Prisma.
 *
 * Il rend et reprend l'**agrégat** plutôt qu'une ligne et un tas de champs, et
 * `save` écrit l'état ENTIER — libellé, offre et grille de tables — en une
 * transaction. Il portait une méthode par mutation ; il en restait des états
 * intermédiaires qu'aucun invariant ne pouvait interdire.
 *
 * Pas de `findByLabel` : l'unicité est tenue par `point_of_sale_label_unique`
 * (index sur `lower(label)`) et traduite en refus par le dépôt. Un pré-contrôle
 * lu ici ne ferait qu'un aller-retour de plus pour une réponse que la seconde
 * transaction concurrente invaliderait de toute façon.
 */
export abstract class PointOfSaleRepository {
  abstract listAll(): Promise<PointOfSale[]>;
  abstract findById(id: string): Promise<PointOfSale | null>;
  abstract add(pointOfSale: PointOfSale, ticket: WriteTicket): Promise<void>;
  /** Écrit l'état entier — libellé, offre ET grille — en une transaction. */
  abstract save(pointOfSale: PointOfSale, ticket: WriteTicket): Promise<void>;
  abstract remove(id: string, ticket: WriteTicket): Promise<void>;
}
