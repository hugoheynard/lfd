import { PolicyPromotionNamesReader } from "../domain/ports/policy-promotion-names.reader.js";

/**
 * Les noms de promotions en mémoire, pour les suites d'application : un
 * identifiant absent de la carte est une promotion qui n'existe pas.
 */
export class InMemoryPolicyPromotionNames extends PolicyPromotionNamesReader {
  constructor(private readonly names: ReadonlyMap<string, string> = new Map()) {
    super();
  }

  namesOf(promotionIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return Promise.resolve(
      new Map(
        promotionIds.flatMap((id) => {
          const name = this.names.get(id);
          return name === undefined ? [] : [[id, name] as const];
        }),
      ),
    );
  }
}
