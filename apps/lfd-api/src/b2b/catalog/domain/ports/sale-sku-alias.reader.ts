import type { SaleSkuAliases } from "../sale-sku-aliases.js";

/**
 * **Les alias qui touchent ces références de vente**
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, L1).
 *
 * Un port de lecture et rien d'autre : personne n'écrit la table avant la
 * migration de bascule (L3), qui l'écrit en SQL.
 */
export abstract class SaleSkuAliasReader {
  /**
   * Les alias dont la référence demandée est l'alias OU la cible, et les
   * autres alias de ces cibles — de quoi répondre `canonical` et
   * `spellingsOf` pour chacune des références demandées.
   */
  abstract around(skus: readonly string[]): Promise<SaleSkuAliases>;
}
