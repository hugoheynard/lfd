/** Ce que les colonnes en brouillon d'un jour pèsent pour un article, toutes sociétés confondues. */
export interface PlannedQuantity {
  /** `AAAA-MM-JJ`, le jour servi de la colonne. */
  readonly day: string;
  readonly sku: string;
  /** La somme des quantités des colonnes `draft` : des pièces, ou des grammes pour un article au poids. */
  readonly quantity: number;
}

/**
 * **« Que pèsent les brouillons du planificateur sur ces jours ? »** — la
 * lecture que le bloc des paniers publie pour le prévisionnel du fournil,
 * déclarée et implémentée par lui
 * (`documentation/fournil/le-previsionnel.md`, la couche planifiée).
 *
 * Seules les colonnes `draft` comptent : une colonne convertie est une
 * commande, déjà dans la demande du commerce ; une colonne refusée, manquée
 * ou retirée ne sera jamais produite. La réponse ne dit ni qui, ni combien
 * de colonnes : des pièces par jour et par article, en une requête agrégée.
 */
export abstract class PlannedQuantitiesReader {
  /** Bornes `AAAA-MM-JJ` COMPRISES. Un jour ou un article sans brouillon manque. */
  abstract draftBetween(from: string, to: string): Promise<readonly PlannedQuantity[]>;
}
