import {
  CatalogPricePerKgReader,
  type CatalogPricePerKg,
} from "../../domain/ports/catalog-price-per-kg.reader.js";

/** Les prix au kilo donnés par SKU de déclinaison ; note les SKU demandés. */
export class GivenPricesPerKg extends CatalogPricePerKgReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly bySku: ReadonlyMap<string, CatalogPricePerKg> = new Map()) {
    super();
  }

  bySkus(skus: readonly string[]): Promise<ReadonlyMap<string, CatalogPricePerKg>> {
    this.asked.push(skus);
    return Promise.resolve(new Map([...this.bySku].filter(([sku]) => skus.includes(sku))));
  }
}
