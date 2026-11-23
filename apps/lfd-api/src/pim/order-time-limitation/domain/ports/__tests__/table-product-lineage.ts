import { ProductLineageReader } from "../product-lineage.reader.js";

/**
 * Le double du rangement du catalogue : une table produit → lignée (la plus
 * proche d'abord), et les familles qui existent. Hérite du port, comme les
 * autres doubles du dépôt.
 */
export class TableProductLineage extends ProductLineageReader {
  constructor(
    private readonly lineages: Readonly<Record<string, readonly string[]>> = {},
    private readonly families: readonly string[] = [],
  ) {
    super();
  }

  lineageOf(productId: string): Promise<readonly string[] | null> {
    return Promise.resolve(this.lineages[productId] ?? null);
  }

  familyExists(categoryId: string): Promise<boolean> {
    return Promise.resolve(this.families.includes(categoryId));
  }
}
