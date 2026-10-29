import { SaleSkuAliasReader } from "../ports/sale-sku-alias.reader.js";
import { SaleSkuAliases, type SaleSkuAliasPair } from "../sale-sku-aliases.js";

/**
 * **Une table d'alias de test**, partagée par les suites qui regroupent par
 * article. Elle étend le port et rend toute la table : `around` n'a pas à
 * filtrer, la canonicalisation ne lit que ce qu'on lui demande.
 */
export class TableSaleSkuAliasReader extends SaleSkuAliasReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly pairs: readonly SaleSkuAliasPair[] = []) {
    super();
  }

  around(skus: readonly string[]): Promise<SaleSkuAliases> {
    this.asked.push(skus);
    return Promise.resolve(SaleSkuAliases.of(this.pairs));
  }
}

/** `P-X` désigne désormais `P-X-1` : la table d'une bascule faite. */
export const P_X_ALIASED: readonly SaleSkuAliasPair[] = [{ aliasSku: "P-X", targetSku: "P-X-1" }];
