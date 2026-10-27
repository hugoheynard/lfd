import { CitedAllergensReader } from "../cited-allergens.reader.js";

/** Ce que la composition de chaque fiche cite, posé par le test. */
export class FixedCitedAllergens extends CitedAllergensReader {
  /** Les lots demandés, pour vérifier qu'aucune lecture n'est faite par fiche. */
  readonly requests: (readonly string[])[] = [];

  constructor(private readonly byProduct: ReadonlyMap<string, readonly string[]> = new Map()) {
    super();
  }

  ofProducts(productIds: readonly string[]): Promise<ReadonlyMap<string, readonly string[]>> {
    this.requests.push([...productIds]);
    return Promise.resolve(
      new Map(
        productIds.flatMap((id) => {
          const codes = this.byProduct.get(id);
          return codes === undefined ? [] : [[id, codes] as const];
        }),
      ),
    );
  }
}
