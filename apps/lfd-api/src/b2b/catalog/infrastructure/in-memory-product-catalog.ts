import { ProductCatalogReader, type CatalogItem } from "../domain/ports/product-catalog.reader.js";

/**
 * **Un catalogue en mémoire**, monté à partir d'une poignée d'articles.
 *
 * Écrit une fois, ici, plutôt que redéclaré en littéral dans chaque suite : le
 * port porte quatre méthodes dont deux se répondent (`resolve` et `resolveMany`
 * doivent dire la même chose du même SKU), et trois copies auraient fini par
 * diverger sur celle qu'on oublie de mettre à jour — donc par éprouver un
 * comportement que personne n'implémente.
 *
 * Il n'est **pas** enregistré comme fournisseur : c'est un double, pas une
 * source. La source de production est `CatalogBackedProductCatalog`.
 */
export class InMemoryProductCatalog extends ProductCatalogReader {
  private readonly bySku: ReadonlyMap<string, CatalogItem>;

  constructor(items: readonly CatalogItem[]) {
    super();
    this.bySku = new Map(items.map((item) => [item.sku, item]));
  }

  resolve(sku: string): Promise<CatalogItem | null> {
    return Promise.resolve(this.bySku.get(sku) ?? null);
  }

  all(): Promise<readonly CatalogItem[]> {
    return Promise.resolve([...this.bySku.values()]);
  }

  /** Un SKU inconnu est **absent** de la table, jamais présent à `null`. */
  resolveMany(skus: readonly string[]): Promise<ReadonlyMap<string, CatalogItem>> {
    const found = new Map<string, CatalogItem>();
    for (const sku of skus) {
      const item = this.bySku.get(sku);
      if (item !== undefined) {
        found.set(sku, item);
      }
    }
    return Promise.resolve(found);
  }
}
