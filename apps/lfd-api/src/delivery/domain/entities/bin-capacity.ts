import { binCapacityUnitsOf } from "../value-objects/bin-capacity-units.js";

/**
 * **Une case de la grille bacs × produits** (L4b-C2, v2-2) : un bac ENTIER du
 * type `binTypeId` contient `units` unités du produit `sku`.
 *
 * Le SKU est un identifiant OPAQUE du catalogue B2B, jamais une jointure. Pas
 * d'agrégat ici : une case n'a ni transition ni état — elle est posée ou
 * absente (`CLAUDE.md` §3.1, « où NE PAS mettre d'agrégat »). La seule règle
 * qui refuse est la borne des unités, tenue à la construction ; celle qui
 * dépend du type (« pas sur un type archivé ») est au type.
 */
export class BinCapacity {
  private constructor(
    readonly binTypeId: string,
    readonly sku: string,
    readonly units: number,
  ) {}

  /** @throws {InvalidBinCapacityError} */
  static of(input: {
    readonly binTypeId: string;
    readonly sku: string;
    readonly units: number;
  }): BinCapacity {
    return new BinCapacity(input.binTypeId, input.sku, binCapacityUnitsOf(input.units));
  }
}
