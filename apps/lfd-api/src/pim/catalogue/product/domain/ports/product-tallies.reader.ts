import type { ProductStatus } from "../entities/product-state.js";

/** Ce qu'il faut d'une fiche pour la compter — et rien d'autre. */
export interface ProductTally {
  readonly productId: string;
  readonly status: ProductStatus;
  readonly categoryId: string;
  /** Ses déclinaisons, arrêtées comprises : chacune est un article. */
  readonly articles: number;
  /** Une signature « prête » est posée sur la fiche. */
  readonly signed: boolean;
}

/**
 * **Toutes les fiches, comptées**, quel que soit leur statut — en une requête,
 * sans rien charger de la fiche au-delà : ni éditorial, ni visuels, ni taux.
 *
 * Port de LECTURE à part (ISP) : la vue d'ensemble du catalogue ne fait que
 * compter, et lui servir l'instantané complet relirait tout le catalogue à
 * chaque visite.
 */
export abstract class ProductTalliesReader {
  abstract tallies(): Promise<readonly ProductTally[]>;
}
