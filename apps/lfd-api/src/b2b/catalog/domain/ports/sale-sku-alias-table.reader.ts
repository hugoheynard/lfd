import type { SaleSkuAliasPair } from "../sale-sku-aliases.js";

/**
 * **La table d'alias entière**, pour la boutique
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, § 5, L2).
 *
 * Un port à part de {@link SaleSkuAliasReader} : la vitrine n'interroge pas
 * des références, elle publie la table pour que le navigateur normalise ce
 * qu'il a gardé. Une ligne par référence produit au plus — quelques centaines.
 */
export abstract class SaleSkuAliasTableReader {
  abstract all(): Promise<readonly SaleSkuAliasPair[]>;
}
