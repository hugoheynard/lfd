import { IngredientArchivedError, IngredientNotFoundError } from "../errors/ingredient-errors.js";

/** Un ingrédient du référentiel, tel que la composition le juge et le nomme. */
export interface CitableIngredient {
  /** Son nom français du jour — figé dans la trace de la fiche. */
  readonly name: string;
  readonly archived: boolean;
}

/** Un ingrédient cité, nommé. */
export interface NamedCitation {
  readonly id: string;
  readonly name: string;
}

/**
 * **Ce qu'une fiche cite comme provenance**, dans son ordre d'affichage.
 *
 * Un agrégat à part de la fiche : la provenance possède `product_ingredient`,
 * et la règle qui refuse une écriture est la sienne — un ingrédient que le
 * référentiel ignore ne se cite pas, un ingrédient archivé ne s'ajoute plus,
 * mais la fiche qui le citait déjà le garde.
 *
 * Une liste sans doublon par construction : citer deux fois le même
 * ingrédient est une redite, pas deux citations.
 */
export class ProductComposition {
  private constructor(
    readonly productId: string,
    private cited: readonly string[],
  ) {}

  /** Relit une composition persistée ; une fiche qui ne cite rien a une liste vide. */
  static rehydrate(productId: string, keys: readonly string[]): ProductComposition {
    return new ProductComposition(productId, unique(keys));
  }

  /**
   * La composition d'une fiche née d'une autre : elle reprend ce que l'origine
   * citait, archivé compris — c'est une copie de l'existant, pas un ajout.
   */
  static copiedFrom(origin: ProductComposition, productId: string): ProductComposition {
    return new ProductComposition(productId, origin.cited);
  }

  get keys(): readonly string[] {
    return this.cited;
  }

  /** La fiche cite déjà exactement cette liste, ordre compris. */
  cites(keys: readonly string[]): boolean {
    const next = unique(keys);
    return next.length === this.cited.length && next.every((key, at) => key === this.cited[at]);
  }

  /**
   * Remplace la liste d'un bloc, dans l'ordre reçu, et rend les ingrédients
   * cités nommés — ce que la trace fige.
   *
   * @throws {IngredientNotFoundError} une clé que le référentiel ignore.
   * @throws {IngredientArchivedError} un ingrédient archivé que la fiche ne
   *   citait pas encore.
   */
  replace(
    keys: readonly string[],
    referential: ReadonlyMap<string, CitableIngredient>,
  ): readonly NamedCitation[] {
    const held = new Set(this.cited);
    const next = unique(keys);
    const named = next.map((key) => {
      const ingredient = referential.get(key);
      if (ingredient === undefined) {
        throw new IngredientNotFoundError(key);
      }
      if (ingredient.archived && !held.has(key)) {
        throw new IngredientArchivedError(key);
      }
      return { id: key, name: ingredient.name };
    });
    this.cited = next;
    return named;
  }
}

function unique(keys: readonly string[]): readonly string[] {
  return [...new Set(keys)];
}
