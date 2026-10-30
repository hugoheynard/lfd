import type { CatalogFamilyNodeView, CatalogFamilyView } from '@lfd/contracts';

import { UNKNOWN_FAMILY_LABEL } from './catalog-shelves';

/** Une sous-catégorie d'un rayon racine. `family: null` = rangé directement dans la racine. */
export interface CatalogShelfSection<T> {
  readonly family: CatalogFamilyView | null;
  readonly items: readonly T[];
}

/** Un rayon RACINE : sa racine, ses articles, et leurs sous-catégories. */
export interface CatalogRootShelf<T> {
  /** `null` : le rayon des articles dont la famille n'est pas connue. */
  readonly root: CatalogFamilyNodeView | null;
  readonly label: string;
  readonly items: readonly T[];
  /** Dans l'ordre du référentiel : la racine elle-même d'abord, puis position puis nom. */
  readonly sections: readonly CatalogShelfSection<T>[];
}

/**
 * Range des articles **par catégorie RACINE** (Hugo, 2026-10-30) — le
 * rangement du fournil : « Viennoiserie fine » tombe dans « Viennoiserie »,
 * jamais dans un rayon à elle. Les racines suivent le référentiel (position,
 * puis nom, puis id) ; leurs sous-catégories aussi, la racine elle-même en
 * tête. Les articles gardent l'ordre reçu.
 *
 * À côté de `catalogShelves` et non à sa place : la saisie d'une commande
 * range encore par famille, et ce n'est pas la même décision.
 *
 * Une famille servie sans `root` (serveur d'avant le 2026-10-30) est sa
 * propre racine. Un article sans famille connue ferme la marche.
 */
export function catalogRootShelves<T>(
  items: readonly T[],
  familyOf: (item: T) => CatalogFamilyView | null,
): readonly CatalogRootShelf<T>[] {
  const byRoot = new Map<string, RootBucket<T>>();
  const unknown: T[] = [];
  for (const item of items) {
    const family = familyOf(item);
    if (family === null) {
      unknown.push(item);
      continue;
    }
    const root = rootOf(family);
    const bucket: RootBucket<T> = byRoot.get(root.id) ?? {
      root,
      items: [],
      families: new Map<string, FamilyBucket<T>>(),
    };
    byRoot.set(root.id, bucket);
    bucket.items.push(item);
    const own: FamilyBucket<T> = bucket.families.get(family.id) ?? { family, items: [] };
    bucket.families.set(family.id, own);
    own.items.push(item);
  }
  const known: CatalogRootShelf<T>[] = [...byRoot.values()]
    .sort((left, right) => byPositionThenName(left.root, right.root))
    .map((bucket) => ({
      root: bucket.root,
      label: bucket.root.name,
      items: bucket.items,
      sections: sectionsOf(bucket),
    }));
  return unknown.length === 0
    ? known
    : [
        ...known,
        {
          root: null,
          label: UNKNOWN_FAMILY_LABEL,
          items: unknown,
          sections: [{ family: null, items: unknown }],
        },
      ];
}

/**
 * Les lignes d'un rayon racine, prêtes à afficher : le tri `compare` sur tout
 * le rayon, ou — sous-catégories affichées — section par section, chacune
 * triée par `compare`, avec l'intertitre de chaque sous-catégorie (le SKU de
 * sa première ligne → son nom). La racine elle-même n'en a pas.
 */
export function arrangedShelf<T extends { readonly sku: string }>(
  sections: readonly CatalogShelfSection<T>[],
  compare: (left: T, right: T) => number,
  showSubcategories: boolean,
): { readonly lines: readonly T[]; readonly intertitles: ReadonlyMap<string, string> } {
  if (!showSubcategories) {
    const lines = sections.flatMap((section) => section.items).sort(compare);
    return { lines, intertitles: new Map() };
  }
  const intertitles = new Map<string, string>();
  const lines = sections.flatMap((section) => {
    const sorted = [...section.items].sort(compare);
    const first = sorted[0];
    if (section.family !== null && first !== undefined) {
      intertitles.set(first.sku, section.family.name);
    }
    return sorted;
  });
  return { lines, intertitles };
}

/**
 * Les intertitres d'une liste rangée : le SKU de la première ligne de chaque
 * sous-catégorie → son nom. Une ligne directement dans la racine n'en ouvre
 * pas ; un changement de section, si.
 */
export function sectionIntertitles<T extends { readonly sku: string }>(
  lines: readonly T[],
  sectionOf: (
    line: T,
  ) => { readonly key: string | null; readonly label: string | null } | undefined,
): ReadonlyMap<string, string> {
  const titles = new Map<string, string>();
  let previous: string | null | undefined;
  for (const line of lines) {
    const section = sectionOf(line);
    const key = section?.key ?? null;
    if (key !== previous && section?.label != null) {
      titles.set(line.sku, section.label);
    }
    previous = key;
  }
  return titles;
}

interface RootBucket<T> {
  readonly root: CatalogFamilyNodeView;
  readonly items: T[];
  readonly families: Map<string, FamilyBucket<T>>;
}

interface FamilyBucket<T> {
  readonly family: CatalogFamilyView;
  readonly items: T[];
}

function rootOf(family: CatalogFamilyView): CatalogFamilyNodeView {
  return family.root ?? { id: family.id, name: family.name, position: family.position };
}

function sectionsOf<T>(bucket: RootBucket<T>): readonly CatalogShelfSection<T>[] {
  const families = [...bucket.families.values()];
  const own = families.find((entry) => entry.family.id === bucket.root.id);
  const children = families
    .filter((entry) => entry.family.id !== bucket.root.id)
    .sort((left, right) => byPositionThenName(left.family, right.family))
    .map((entry) => ({ family: entry.family, items: entry.items }));
  return own === undefined ? children : [{ family: null, items: own.items }, ...children];
}

function byPositionThenName(left: CatalogFamilyNodeView, right: CatalogFamilyNodeView): number {
  const delta = left.position - right.position;
  if (delta !== 0) {
    return delta;
  }
  const byName = left.name.localeCompare(right.name, 'fr');
  return byName !== 0 ? byName : left.id.localeCompare(right.id);
}
