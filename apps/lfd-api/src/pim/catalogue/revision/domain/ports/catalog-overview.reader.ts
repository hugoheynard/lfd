import type { ProductStatus } from "../../../product/domain/entities/product.js";

/**
 * Ce qu'il faut savoir d'une fiche pour la compter — et rien d'autre. Pas
 * d'éditorial, pas de visuels, pas de taux : compter ne les lit pas.
 */
export interface OverviewProductRow {
  readonly productId: string;
  readonly status: ProductStatus;
  readonly categoryId: string;
  /** Ses déclinaisons, arrêtées comprises : chacune est un article. */
  readonly articles: number;
  readonly signed: boolean;
  /** Sa famille existe. Un rattachement cassé est un refus, pas un zéro. */
  readonly categoryKnown: boolean;
}

/**
 * Le compte du catalogue, lu par agrégat.
 *
 * Un port À PART de `CatalogRevisionSource` : celle-ci photographie la fiche
 * entière pour une ancre ; la vue d'ensemble ne fait que compter, et lui
 * demander la photo complète relisait tout le catalogue à chaque visite.
 */
export abstract class CatalogOverviewReader {
  /** Toutes les fiches, quel que soit leur statut : la règle de tri est au domaine. */
  abstract productRows(): Promise<readonly OverviewProductRow[]>;
}
