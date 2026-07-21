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
export abstract class CatalogueReader {
  abstract publishable(): Promise<ProductRecord[]>;
  abstract byIds(ids: readonly string[]): Promise<ProductRecord[]>;
}
