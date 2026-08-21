import { CategoryCycleError, CategoryOrderMismatchError } from "../errors/category-errors.js";

/**
 * **Les règles que l'agrégat ne peut pas tenir seul** : elles portent sur la
 * fratrie ou sur la lignée, donc sur des lignes qu'une famille ne voit pas.
 * Fonctions pures sur la forme minimale de l'arbre — un id, un parent — pour
 * qu'elles se testent sans base et sans entité complète.
 */
export interface TreeNode {
  readonly id: string;
  readonly parentId: string | null;
}

/**
 * Refuse un déplacement qui ferait descendre une famille sous elle-même.
 *
 * On remonte la lignée du parent VISÉ : si on y recroise la famille déplacée,
 * l'arbre se refermerait sur lui-même et toute lecture récursive boucherait.
 * `null` (racine) ne peut jamais créer de cycle.
 */
export function assertNoCycle(
  tree: readonly TreeNode[],
  movedId: string,
  targetParentId: string | null,
): void {
  const parentOf = new Map(tree.map((node) => [node.id, node.parentId]));
  let cursor = targetParentId;
  while (cursor !== null) {
    if (cursor === movedId) {
      throw new CategoryCycleError(movedId);
    }
    cursor = parentOf.get(cursor) ?? null;
  }
}

/**
 * Exige que l'ordre proposé soit une **permutation complète** de la fratrie.
 *
 * Un ordre partiel laisserait des familles à leur ancien rang, donc des rangs
 * en double : l'affichage retomberait sur l'ordre d'insertion, c'est-à-dire
 * sur rien. Mieux vaut refuser que ranger à moitié.
 */
export function assertCompleteOrder(
  siblingIds: readonly string[],
  orderedIds: readonly string[],
  parentId: string | null,
): void {
  const proposed = new Set(orderedIds);
  const isPermutation =
    proposed.size === orderedIds.length &&
    orderedIds.length === siblingIds.length &&
    siblingIds.every((id) => proposed.has(id));
  if (!isPermutation) {
    throw new CategoryOrderMismatchError(parentId);
  }
}
