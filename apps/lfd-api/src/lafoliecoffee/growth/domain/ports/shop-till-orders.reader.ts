import type { ShopTillOrderEntry } from "../shop-till/shop-till-orders-report.js";

/**
 * Port de **lecture** des commandes notées au comptoir, à régler à la caisse
 * de la boutique (`settlement_venue = 'shop_till'`), passées — ni brouillon
 * ni annulée —, dont le jour de retrait tombe de `from` à `to` compris.
 *
 * Le pendant du chiffre d'affaires web, qui les exclut (`revenue-scope.ts`,
 * `REVENUE_SETTLEMENT_VENUE`) : chacune est lue ici ou là, jamais les deux.
 */
export abstract class ShopTillOrdersReader {
  abstract entries(from: string, to: string): Promise<readonly ShopTillOrderEntry[]>;
}
