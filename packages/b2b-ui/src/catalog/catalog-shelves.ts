import type { CatalogFamilyView } from '@lfd/contracts';

/** Un rayon : sa famille, son libellé, et ce qu'il contient. */
export interface CatalogShelf<T> {
  /** `null` : le rayon des articles dont la famille n'est pas connue. */
  readonly family: CatalogFamilyView | null;
  readonly label: string;
  readonly items: readonly T[];
}

/**
 * Range des articles **par famille, dans l'ordre du référentiel** — la
 * `position` de la famille, puis son nom.
 *
 * Plus de liste des rayons ici (plan des familles en données, 2026-09-26) :
 * une famille livrée par le référentiel devient un rayon sans déploiement du
 * front. L'union fermée qu'elle remplace a fait tomber le catalogue pro le jour
 * où le PIM en a créé une qu'elle ne connaissait pas.
 *
 * Une fonction et non un composant : les deux fronts affichent ces rayons
 * différemment (grille de cartes chez le client, liste dense au back-office),
 * mais ils les composent pareil. C'est le groupement qui se partage, pas la mise
 * en page.
 *
 * **Un rayon vide n'existe pas** : les rayons naissent des articles. Après une
 * recherche, un en-tête sans article laisserait croire que le filtre a échoué.
 *
 * **Un article sans famille connue** ferme la marche sous son propre titre : il
 * reste commandable, et il n'est pas rangé dans un rayon deviné.
 */
export function catalogShelves<T>(
  items: readonly T[],
  familyOf: (item: T) => CatalogFamilyView | null,
): readonly CatalogShelf<T>[] {
  const byFamily = new Map<string, { family: CatalogFamilyView; items: T[] }>();
  const unknown: T[] = [];
  for (const item of items) {
    const family = familyOf(item);
    if (family === null) {
      unknown.push(item);
      continue;
    }
    const shelf = byFamily.get(family.id);
    if (shelf === undefined) {
      byFamily.set(family.id, { family, items: [item] });
    } else {
      shelf.items.push(item);
    }
  }
  const known: CatalogShelf<T>[] = [...byFamily.values()]
    .sort((left, right) => byPositionThenName(left.family, right.family))
    .map((shelf) => ({ family: shelf.family, label: shelf.family.name, items: shelf.items }));
  return unknown.length === 0
    ? known
    : [...known, { family: null, label: UNKNOWN_FAMILY_LABEL, items: unknown }];
}

function byPositionThenName(left: CatalogFamilyView, right: CatalogFamilyView): number {
  const delta = left.position - right.position;
  return delta === 0 ? left.name.localeCompare(right.name, 'fr') : delta;
}

/** Le titre du rayon des articles dont la famille n'est pas connue. */
export const UNKNOWN_FAMILY_LABEL = 'Sans famille connue';
