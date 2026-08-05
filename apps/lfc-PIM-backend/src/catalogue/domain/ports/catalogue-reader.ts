import type { ProductRecord } from './product.repository.js';

/**
 * **Le seul point d'entrée des adaptateurs de canal dans le catalogue.**
 *
 * Règle d'ADR-13 : un module ne lit jamais les tables d'un autre. L'adaptateur Shopify
 * ne connaît ni `PrismaProductRepository` ni la table `product` — il demande ici.
 *
 * Test de validation : si on supprimait le module Shopify, le catalogue compilerait
 * encore. L'inverse n'est pas vrai, et c'est voulu — la dépendance va du bord vers le
 * centre, jamais l'inverse.
 */
/**
 * Handles de collection `tva-*` d'une catégorie, **par contexte de vente**. La
 * résolution `catégorie → régime → tag` est faite *dans* le catalogue (qui possède la
 * catégorie et connaît le régime qu'elle vise) ; l'adaptateur Shopify n'en lit que le
 * résultat. `null` = contexte non réglé sur la catégorie.
 */
export interface CategoryTvaTags {
  readonly emporter: string | null;
  readonly surPlace: string | null;
}

export abstract class CatalogueReader {
  abstract publishable(): Promise<ProductRecord[]>;
  abstract byIds(ids: readonly string[]): Promise<ProductRecord[]>;
  /** Le tag de collection `tva-*` par contexte pour une catégorie (résout le régime). */
  abstract tvaTags(categoryId: string): Promise<CategoryTvaTags>;
}
