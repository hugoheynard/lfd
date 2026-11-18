import {
  SaleReferenceUsage,
  type SaleReferenceQuery,
  type SaleReferenceUse,
} from "../sale-reference-usage.js";

/**
 * Le commerce doublé : chaque déclinaison répond par les usages qu'on lui a
 * donnés, une liste vide sinon. Garde les lots demandés, pour vérifier qu'il
 * n'est interrogé que quand l'unité change.
 */
export class FixedSaleReferenceUsage extends SaleReferenceUsage {
  readonly asked: (readonly SaleReferenceQuery[])[] = [];

  constructor(private readonly uses: Readonly<Record<string, readonly SaleReferenceUse[]>> = {}) {
    super();
  }

  usesOf(
    references: readonly SaleReferenceQuery[],
  ): Promise<ReadonlyMap<string, readonly SaleReferenceUse[]>> {
    this.asked.push(references);
    return Promise.resolve(
      new Map(references.map((reference) => [reference.sku, this.uses[reference.sku] ?? []])),
    );
  }
}

/** Le commerce en panne : la promesse est rejetée. */
export class FailingSaleReferenceUsage extends SaleReferenceUsage {
  usesOf(): Promise<ReadonlyMap<string, readonly SaleReferenceUse[]>> {
    return Promise.reject(new Error("commerce injoignable"));
  }
}
