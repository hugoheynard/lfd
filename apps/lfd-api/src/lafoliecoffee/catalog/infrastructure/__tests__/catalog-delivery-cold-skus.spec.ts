import { CatalogColdReader } from "../../domain/ports/catalog-cold.reader.js";
import { CatalogDeliveryColdSkusReader } from "../catalog-delivery-cold-skus.reader.js";

/** Le miroir, figé sur des SKU de vente. */
class FixedColdShopSkus extends CatalogColdReader {
  constructor(private readonly skus: readonly string[]) {
    super();
  }
  coldShopSkus(): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(this.skus));
  }
}

describe("CatalogDeliveryColdSkusReader — le froid relayé par SKU de vente", () => {
  it("relaie tel quel l'ensemble du miroir, déclinaisons comprises", async () => {
    const reader = new CatalogDeliveryColdSkusReader(new FixedColdShopSkus(["TAR", "TAR-2"]));

    expect([...(await reader.coldSkus())]).toEqual(["TAR", "TAR-2"]);
  });
});
