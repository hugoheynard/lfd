import type { WriteTicket } from "../../../journal/pim-journal.js";
import type { AppellationSnapshot } from "../entities/appellation.entity.js";
import type { IngredientAggregate, IngredientSnapshot } from "../entities/ingredient.entity.js";

/** Un ingrédient tel qu'on le LIT : son appellation résolue, et ce qui le retient. */
export interface IngredientRecord extends IngredientSnapshot {
  /** L'appellation citée, déjà résolue — l'écran n'a pas à la re-chercher. */
  readonly appellation: AppellationSnapshot | null;
  /** Combien de fiches le citent. Zéro = il est effaçable. */
  readonly usedBy: number;
}

/** Le référentiel des **provenances** — lecture et écriture. */
export abstract class IngredientRepository {
  abstract list(): Promise<readonly IngredientRecord[]>;
  abstract findByKey(key: string): Promise<IngredientAggregate | null>;
  abstract add(ingredient: IngredientAggregate, ticket: WriteTicket): Promise<void>;
  abstract save(ingredient: IngredientAggregate, ticket: WriteTicket): Promise<void>;
  /** Refuse (`IngredientInUseError`) si des fiches le citent encore. */
  abstract remove(key: string, ticket: WriteTicket): Promise<void>;

  /** Ce qu'une fiche cite, dans son ordre d'affichage. */
  abstract ofProduct(productId: string): Promise<readonly IngredientRecord[]>;
  /**
   * Remplace ce qu'une fiche cite, d'un bloc.
   *
   * Un REMPLACEMENT et non un ajout/retrait unitaire : c'est un seul geste
   * éditorial à l'écran — la liste et son ordre — et le journal doit en garder
   * une trace, pas trois.
   */
  abstract setOfProduct(
    productId: string,
    keys: readonly string[],
    ticket: WriteTicket,
  ): Promise<void>;
}
