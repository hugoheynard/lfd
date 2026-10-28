import { IllustratedProductsReader } from "../illustrated-products.reader.js";

/** Le double : les fiches illustrées sont celles qu'on lui donne. */
export class FixedIllustratedProducts extends IllustratedProductsReader {
  constructor(private readonly illustrated: readonly string[] = []) {
    super();
  }

  amongst(productIds: readonly string[]): Promise<ReadonlySet<string>> {
    const wanted = new Set(productIds);
    return Promise.resolve(new Set(this.illustrated.filter((id) => wanted.has(id))));
  }
}
