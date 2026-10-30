import type { CatalogFamilyNodeView, CatalogFamilyView } from "@lfd/contracts";

/**
 * **Le rangement du fournil par catégorie RACINE** (Hugo, 2026-10-30).
 *
 * Les catégories du référentiel sont imbriquées : « Viennoiserie fine » est
 * enfant de « Viennoiserie ». Ranger par la famille de l'article faisait une
 * fiche — un onglet, une page du dossier — par sous-catégorie. Le fournil
 * range désormais par racine, et le réglage « Afficher les sous-catégories »
 * pose, DANS le groupe racine, un intertitre par sous-catégorie.
 *
 * Fonction pure : la famille arrive du commerce par `WorkshopShelvesReader`
 * (sa `root` comprise) ; rien ici ne lit le catalogue.
 */

/** Une sous-catégorie d'un groupe racine. `family: null` = rangé directement dans la racine. */
export interface ShelfSection<T> {
  readonly family: CatalogFamilyView | null;
  readonly items: readonly T[];
}

/** Un groupe racine : sa racine, ses articles, et leurs sous-catégories dans l'ordre du référentiel. */
export interface RootShelf<T> {
  readonly root: CatalogFamilyNodeView;
  readonly items: readonly T[];
  readonly sections: readonly ShelfSection<T>[];
}

/** Les groupes racine dans l'ordre du référentiel, et ce qui n'a pas de famille connue. */
export interface RootShelving<T> {
  readonly shelves: readonly RootShelf<T>[];
  readonly unshelved: readonly T[];
}

/**
 * La racine d'une famille : celle que le commerce a servie, ou la famille
 * elle-même — une vue sans `root` vient d'un catalogue sans hiérarchie.
 */
export function rootOf(family: CatalogFamilyView): CatalogFamilyNodeView {
  return family.root ?? { id: family.id, name: family.name, position: family.position };
}

/** Position, puis nom, puis id : deux homonymes restent chacun d'un bloc. */
export function byPositionThenName(
  left: CatalogFamilyNodeView,
  right: CatalogFamilyNodeView,
): number {
  const delta = left.position - right.position;
  if (delta !== 0) {
    return delta;
  }
  const byName = left.name.localeCompare(right.name, "fr");
  return byName !== 0 ? byName : left.id.localeCompare(right.id);
}

/**
 * Range les articles par racine, puis par sous-catégorie. Les articles
 * gardent l'ordre reçu dans leur section ; la section de la racine elle-même
 * vient en tête, les autres suivent par position puis nom.
 */
export function rootShelvesOf<T>(
  items: readonly T[],
  familyOf: (item: T) => CatalogFamilyView | undefined,
): RootShelving<T> {
  const byRoot = new Map<string, RootBucket<T>>();
  const unshelved: T[] = [];
  for (const item of items) {
    const family = familyOf(item);
    if (family === undefined) {
      unshelved.push(item);
      continue;
    }
    const root = rootOf(family);
    const shelf: RootBucket<T> = byRoot.get(root.id) ?? {
      root,
      items: [],
      families: new Map<string, ShelfBucket<T>>(),
    };
    byRoot.set(root.id, shelf);
    shelf.items.push(item);
    const bucket = shelf.families.get(family.id) ?? { family, items: [] };
    shelf.families.set(family.id, bucket);
    bucket.items.push(item);
  }
  const shelves = [...byRoot.values()]
    .sort((left, right) => byPositionThenName(left.root, right.root))
    .map((shelf) => ({
      root: shelf.root,
      items: shelf.items,
      sections: sectionsOf(shelf.root, [...shelf.families.values()]),
    }));
  return { shelves, unshelved };
}

interface RootBucket<T> {
  readonly root: CatalogFamilyNodeView;
  readonly items: T[];
  readonly families: Map<string, ShelfBucket<T>>;
}

interface ShelfBucket<T> {
  readonly family: CatalogFamilyView;
  readonly items: T[];
}

function sectionsOf<T>(
  root: CatalogFamilyNodeView,
  buckets: readonly ShelfBucket<T>[],
): readonly ShelfSection<T>[] {
  const own = buckets.find((bucket) => bucket.family.id === root.id);
  const children = buckets
    .filter((bucket) => bucket.family.id !== root.id)
    .sort((left, right) => byPositionThenName(left.family, right.family))
    .map((bucket) => ({ family: bucket.family, items: bucket.items }));
  return own === undefined ? children : [{ family: null, items: own.items }, ...children];
}

/**
 * Les articles d'un groupe dans l'ordre de ses sections, chacune triée par
 * `compare` — l'ordre que suit un groupe quand les intertitres sont affichés.
 */
export function sectionOrdered<T>(
  sections: readonly ShelfSection<T>[],
  compare: (left: T, right: T) => number,
): readonly T[] {
  return sections.flatMap((section) => [...section.items].sort(compare));
}
