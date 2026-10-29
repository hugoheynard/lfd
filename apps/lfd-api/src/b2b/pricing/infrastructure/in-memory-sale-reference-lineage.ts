import { SaleReferenceLineageReader } from "../domain/ports/sale-reference-lineage.reader.js";

/** La filiation en mémoire, pour les suites d'application : nouvelle référence → ancienne. */
export class InMemorySaleReferenceLineage extends SaleReferenceLineageReader {
  constructor(private readonly origins: Readonly<Record<string, string>> = {}) {
    super();
  }

  detachedFromOf(shopSku: string): Promise<string | null> {
    return Promise.resolve(this.origins[shopSku] ?? null);
  }
}
