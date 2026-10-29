/**
 * **L'arbre des rayons** — les familles imbriquées du référentiel, telles que
 * le rail « Plonger » et le filtre de la grille les lisent (handoff du
 * 2026-10-29, SPEC §1).
 *
 * Fonctions pures, sans Angular : le rail en tire ses niveaux, la boutique son
 * filtre par sous-arbre. Une seule définition de « qui est sous qui » — deux
 * auraient fini par ne plus s'accorder sur ce qu'une parente montre.
 *
 * L'arbre se construit depuis une liste plate `{ id, parentId }` : le serveur
 * sert chaque rayon avec sa parente (`ShopShelfView.parentId`), et les
 * pastilles qui ne sont pas des familles (« Tout », la mise en avant, les
 * opérations) y entrent comme des racines sans enfant.
 */

/** La clé du niveau de tête — aucune famille ne la porte. */
export const ROOT_LEVEL = 'root';

/** Ce que l'arbre lit d'un rayon. */
export interface ShelfEntry {
  readonly id: string;
  readonly label: string;
  /** `null` ou absente : un rayon de tête. */
  readonly parentId?: string | null | undefined;
}

/** Un nœud de l'arbre. */
export interface ShelfNode {
  readonly id: string;
  readonly label: string;
  readonly parentId: string | null;
  /** Les enfants, dans l'ordre de la liste servie. */
  readonly children: readonly string[];
}

export interface ShelfTree {
  readonly nodes: ReadonlyMap<string, ShelfNode>;
  /** Les rayons de tête, dans l'ordre de la liste servie. */
  readonly roots: readonly string[];
  /** Vrai dès qu'un rayon a une parente : le rail plonge, sinon il reste à plat. */
  readonly nested: boolean;
}

/** L'état d'un niveau par rapport au niveau affiché (SPEC §5.1). */
export type LevelState = 'cur' | 'left' | 'right';

/**
 * Construit l'arbre. Une parente inconnue de la liste ne fait pas disparaître
 * son enfant : il remonte en tête.
 */
export function shelfTreeOf(entries: readonly ShelfEntry[]): ShelfTree {
  const known = new Set(entries.map((entry) => entry.id));
  const parentOf = (entry: ShelfEntry): string | null =>
    entry.parentId !== undefined && entry.parentId !== null && known.has(entry.parentId)
      ? entry.parentId
      : null;
  const children = new Map<string, string[]>();
  for (const entry of entries) {
    const parent = parentOf(entry);
    if (parent !== null) {
      children.set(parent, [...(children.get(parent) ?? []), entry.id]);
    }
  }
  const nodes = new Map<string, ShelfNode>();
  for (const entry of entries) {
    if (!nodes.has(entry.id)) {
      nodes.set(entry.id, {
        id: entry.id,
        label: entry.label,
        parentId: parentOf(entry),
        children: children.get(entry.id) ?? [],
      });
    }
  }
  const roots = [...nodes.values()].filter((node) => node.parentId === null).map((n) => n.id);
  return { nodes, roots, nested: children.size > 0 };
}

/** Le chemin de la racine au nœud, nœud compris — vide pour un rayon inconnu. */
export function pathOf(tree: ShelfTree, id: string): readonly string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let current = tree.nodes.get(id);
  while (current !== undefined && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.id);
    current = current.parentId === null ? undefined : tree.nodes.get(current.parentId);
  }
  return path;
}

/** A-t-il des enfants ? — un rayon qui en a est un niveau du rail. */
export function hasChildren(tree: ShelfTree, id: string): boolean {
  return (tree.nodes.get(id)?.children.length ?? 0) > 0;
}

/**
 * **Le niveau affiché** : le rayon choisi s'il a des enfants, sinon sa
 * parente, sinon la tête. Choisir une feuille ne change donc pas de niveau.
 */
export function focusOf(tree: ShelfTree, selected: string | null): string {
  if (selected === null) {
    return ROOT_LEVEL;
  }
  if (hasChildren(tree, selected)) {
    return selected;
  }
  return tree.nodes.get(selected)?.parentId ?? ROOT_LEVEL;
}

/**
 * `cur` pour le niveau affiché, `left` pour la tête et les ancêtres du niveau
 * affiché, `right` pour tout le reste — descendants et cousins. La direction
 * du mouvement découle seule de ces trois états (SPEC §5.2).
 */
export function levelState(tree: ShelfTree, levelId: string, focus: string): LevelState {
  if (levelId === focus) {
    return 'cur';
  }
  if (levelId === ROOT_LEVEL || pathOf(tree, focus).includes(levelId)) {
    return 'left';
  }
  return 'right';
}

/** Les niveaux du rail : la tête, puis chaque rayon qui a des enfants. */
export function levelIdsOf(tree: ShelfTree): readonly string[] {
  return [
    ROOT_LEVEL,
    ...[...tree.nodes.values()].filter((n) => n.children.length > 0).map((n) => n.id),
  ];
}

/** Le rayon `shelfId` est-il dans le sous-arbre de `id` (lui compris) ? */
export function inSubtree(tree: ShelfTree, shelfId: string, id: string): boolean {
  return pathOf(tree, shelfId).includes(id);
}

/** Les articles du sous-arbre entier : une parente compte ceux de ses descendantes. */
export function countOf(
  tree: ShelfTree,
  id: string,
  items: readonly { readonly shelfId: string }[],
): number {
  return items.filter((item) => inSubtree(tree, item.shelfId, id)).length;
}

/** Où remonte la pastille de tête d'un niveau : sa parente, ou `parentFallback` à la tête. */
export function climbTargetOf(tree: ShelfTree, levelId: string, parentFallback: string): string {
  return tree.nodes.get(levelId)?.parentId ?? parentFallback;
}
