import { ReservedElsewhereReader } from "../domain/ports/reserved-elsewhere.reader.js";

/**
 * Les réservations en mémoire, pour les suites d'application : chaque SKU
 * déclaré est réservé aux seuls comptes nommés.
 */
export class InMemoryReservedElsewhere extends ReservedElsewhereReader {
  constructor(private readonly holders: ReadonlyMap<string, readonly string[]> = new Map()) {
    super();
  }

  among(companyId: string, shopSkus: readonly string[]): Promise<readonly string[]> {
    return Promise.resolve(
      shopSkus.filter((sku) => {
        const reservedTo = this.holders.get(sku);
        return reservedTo !== undefined && !reservedTo.includes(companyId);
      }),
    );
  }
}
