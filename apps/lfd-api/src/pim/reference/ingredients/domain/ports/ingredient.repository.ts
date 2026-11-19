import type { WriteTicket } from "../../../../../platform/journal/scoped-journal.js";
import type { AppellationSnapshot } from "../entities/appellation.entity.js";
import type { IngredientAggregate, IngredientSnapshot } from "../entities/ingredient.entity.js";

/** Un ingrédient tel qu'on le LIT : son appellation résolue, et ce qui le retient. */
export interface IngredientRecord extends IngredientSnapshot {
  /** L'appellation citée, déjà résolue — l'écran n'a pas à la re-chercher. */
  readonly appellation: AppellationSnapshot | null;
  /** Combien de fiches le citent — elles le gardent, même archivé. */
  readonly usedBy: number;
}

/**
 * Le référentiel des **provenances** — lecture et écriture.
 *
 * `add` et `save` prennent et rendent l'**agrégat entier**, allergènes compris :
 * ce que contient une matière est un fait qui lui appartient (la liaison meurt
 * avec elle, en `Cascade`), et une méthode `setAllergensOf(key, codes)` aurait
 * fait du dépôt un CRUD dont l'invariant — un ensemble sans doublon — se serait
 * retrouvé dans le handler.
 */
export abstract class IngredientRepository {
  abstract list(): Promise<readonly IngredientRecord[]>;
  abstract findByKey(key: string): Promise<IngredientAggregate | null>;
  abstract add(ingredient: IngredientAggregate, ticket: WriteTicket): Promise<void>;
  abstract save(ingredient: IngredientAggregate, ticket: WriteTicket): Promise<void>;
  /**
   * N'écrit QUE `archived_at` — pour l'archive et la restauration. Le geste
   * charge l'agrégat sous verrou, mais un renommage concurrent peut l'avoir
   * précédé : réécrire toute la ligne effacerait ce renommage.
   */
  abstract saveArchival(ingredient: IngredientAggregate, ticket: WriteTicket): Promise<void>;

  /**
   * Ce qu'une fiche cite, dans son ordre d'affichage — en LECTURE. L'écriture
   * passe par l'agrégat `ProductComposition` et son dépôt.
   */
  abstract ofProduct(productId: string): Promise<readonly IngredientRecord[]>;
}
