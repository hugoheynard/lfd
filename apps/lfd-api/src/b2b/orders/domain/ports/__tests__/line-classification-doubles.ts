import {
  type OrderLineClassification,
  OrderLineClassificationReader,
} from "../order-line-classification.reader.js";

/**
 * Le rangement des SKU, tenu en mémoire — le double du port que le catalogue
 * implémente. Un SKU absent de la table n'est pas classé, comme en base.
 * `asked` garde chaque lecture : un test peut dire qu'un devis sans règle n'a
 * rien demandé au catalogue.
 */
export class FixedLineClassifications extends OrderLineClassificationReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly table: Readonly<Record<string, OrderLineClassification>> = {}) {
    super();
  }

  classify(skus: readonly string[]): Promise<ReadonlyMap<string, OrderLineClassification>> {
    this.asked.push(skus);
    const found = new Map<string, OrderLineClassification>();
    for (const sku of skus) {
      const known = this.table[sku];
      if (known !== undefined) {
        found.set(sku, known);
      }
    }
    return Promise.resolve(found);
  }
}
