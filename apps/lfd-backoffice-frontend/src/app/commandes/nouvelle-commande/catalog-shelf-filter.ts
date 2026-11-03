import type { CatalogFamilyNodeView, CatalogItemView } from '@lfd/contracts';
import { inSubtree, type ShelfEntry, type ShelfTree } from '@lfd/b2b-ui/catalog';

/** La pastille « Tout » du rail de la saisie — aucune famille ne porte cet id. */
export const ALL_FAMILIES = 'all';
/** Le rayon des articles reçus sans famille connue. */
export const UNKNOWN_FAMILY_SHELF = 'unknown-family';

/** Ce que le rail de la saisie reçoit : ses pastilles, et lesquelles sont des familles. */
export interface FamilyShelves {
  readonly entries: readonly ShelfEntry[];
  readonly families: ReadonlySet<string>;
}

/**
 * **Les rayons de la saisie, en arbre** (2026-11-03) — le filtre de la
 * boutique, monté sur le catalogue que le staff compose pour un client.
 *
 * Le catalogue vendable sert chaque article avec sa famille et les parentes de
 * celle-ci (`CatalogFamilyView.ancestors`) : une parente sans article à elle
 * n'est dans aucune ligne, elle n'entre dans l'arbre que par là. « Tout »
 * ouvre la liste ; les articles sans famille connue ferment la marche, sous
 * leur propre pastille.
 */
export function familyShelvesOf(
  items: readonly CatalogItemView[],
  allLabel: string,
  unknownLabel: string,
): FamilyShelves {
  const nodes = new Map<string, CatalogFamilyNodeView & { readonly parentId: string | null }>();
  let unknown = false;
  for (const item of items) {
    const family = item.family;
    if (family === null) {
      unknown = true;
      continue;
    }
    const lineage = [family, ...(family.ancestors ?? [])];
    lineage.forEach((node, index) => {
      if (!nodes.has(node.id)) {
        const { id, name, position } = node;
        nodes.set(id, { id, name, position, parentId: lineage[index + 1]?.id ?? null });
      }
    });
  }
  const families = [...nodes.values()].sort(
    (left, right) => left.position - right.position || left.name.localeCompare(right.name, 'fr'),
  );
  return {
    entries: [
      { id: ALL_FAMILIES, label: allLabel },
      ...families.map(({ id, name, parentId }) => ({ id, label: name, parentId })),
      ...(unknown ? [{ id: UNKNOWN_FAMILY_SHELF, label: unknownLabel }] : []),
    ],
    families: new Set([...nodes.keys(), ...(unknown ? [UNKNOWN_FAMILY_SHELF] : [])]),
  };
}

/** Le rayon d'un article, tel que le rail le compte. */
export function shelfIdOf(item: CatalogItemView): string {
  return item.family?.id ?? UNKNOWN_FAMILY_SHELF;
}

/** L'article est-il sous le rayon choisi ? « Tout » montre tout ; une parente, son sous-arbre. */
export function inChosenShelf(tree: ShelfTree, item: CatalogItemView, chosen: string): boolean {
  return chosen === ALL_FAMILIES || inSubtree(tree, shelfIdOf(item), chosen);
}
