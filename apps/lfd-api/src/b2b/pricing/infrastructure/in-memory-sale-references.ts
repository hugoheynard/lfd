import {
  SaleReferenceReader,
  type SaleReferenceStanding,
} from "../domain/ports/sale-reference.reader.js";

/**
 * Les références de vente en mémoire, pour les suites d'application : ce que
 * l'on déclare en vente ou retiré l'est, tout le reste est inconnu.
 */
export class InMemorySaleReferences extends SaleReferenceReader {
  readonly asked: (readonly string[])[] = [];
  private readonly standings = new Map<string, SaleReferenceStanding>();

  constructor(onSale: readonly string[] = [], withdrawn: readonly string[] = []) {
    super();
    onSale.forEach((sku) => this.standings.set(sku, "on_sale"));
    withdrawn.forEach((sku) => this.standings.set(sku, "withdrawn"));
  }

  standingOf(shopSkus: readonly string[]): Promise<ReadonlyMap<string, SaleReferenceStanding>> {
    this.asked.push(shopSkus);
    const found = new Map<string, SaleReferenceStanding>();
    for (const sku of shopSkus) {
      const standing = this.standings.get(sku);
      if (standing !== undefined) {
        found.set(sku, standing);
      }
    }
    return Promise.resolve(found);
  }
}
