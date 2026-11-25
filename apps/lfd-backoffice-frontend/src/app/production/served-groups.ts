import {
  SHELF_LABEL_UNKNOWN,
  type ProductionGroupingEntryView,
  type ProductionGroupingView,
  type WorkshopGroupKind,
  type WorkshopLineRole,
} from '@lfd/contracts';

/**
 * **Le rangement servi**, appliqué à des lignes d'écran (plan
 * `documentation/fournil/les-postes-du-fournil.md`, § 3.7).
 *
 * Le prévisionnel et le récapitulatif ne rangent plus eux-mêmes : le serveur
 * dit, pour chaque SKU affiché, son groupe (un rayon en mode boutique, un poste
 * en mode prod, un rayon « à ranger »), son rang et son intertitre. L'écran ne
 * fait plus que trier À L'INTÉRIEUR d'un groupe (le plus gros d'abord), parce
 * que cet ordre dépend des quantités qu'il affiche.
 *
 * En mode prod, une ligne dont le produit a plusieurs postes ressort sous
 * chacun : la charge d'un poste la compte, un total général la compte une
 * fois ({@link distinctBySku}).
 *
 * Un rangement absent (la lecture a échoué) ou un SKU qu'il ne nomme pas (coupé
 * par la borne du serveur) tombe dans un groupe « Rayon inconnu », en dernier :
 * jamais une ligne perdue.
 */
export interface ServedGroup<T> {
  /** La clé du groupe : l'id du rayon racine, `ws:<id du poste>`, `?`. */
  readonly key: string;
  readonly title: string;
  /** `null` : le groupe de repli, le rangement n'a pas été lu. */
  readonly kind: WorkshopGroupKind | null;
  readonly lines: readonly T[];
  /** Les intertitres : SKU de la première ligne d'une section → son nom. */
  readonly intertitles: ReadonlyMap<string, string>;
  /**
   * SKU → ce que le poste du groupe fait de la ligne, pour les seuls produits
   * à plusieurs postes : la mention « étape » ou « finit ». Absent : un seul
   * poste, rien à dire.
   */
  readonly roles: ReadonlyMap<string, WorkshopLineRole>;
}

/** La clé du groupe de repli, quand le rangement n'a rien dit d'un SKU. */
export const UNGROUPED_KEY = '?';

interface Bucket<T> {
  readonly entry: ProductionGroupingEntryView;
  readonly items: { readonly item: T; readonly entry: ProductionGroupingEntryView }[];
}

/**
 * Range des lignes par le rangement servi : les groupes dans l'ordre du
 * serveur, les lignes triées par `compare` dans chaque section.
 */
export function servedGroups<T extends { readonly sku: string }>(
  items: readonly T[],
  grouping: ProductionGroupingView | null,
  compare: (left: T, right: T) => number,
): readonly ServedGroup<T>[] {
  // Un SKU à plusieurs postes a une entrée par poste, étapes comprises : sa
  // ligne ressort sous CHACUN, et compte dans la charge de chacun
  // (`un-produit-sur-plusieurs-postes.md`, § 2.2). Un total général se
  // dédoublonne par SKU (`distinctBySku`).
  const entriesOf = new Map<string, ProductionGroupingEntryView[]>();
  for (const entry of grouping?.entries ?? []) {
    entriesOf.set(entry.sku, [...(entriesOf.get(entry.sku) ?? []), entry]);
  }
  const buckets = new Map<string, Bucket<T>>();
  const ungrouped: T[] = [];
  for (const item of items) {
    const entries = entriesOf.get(item.sku) ?? [];
    if (entries.length === 0) {
      ungrouped.push(item);
    }
    for (const entry of entries) {
      const bucket = buckets.get(entry.key) ?? { entry, items: [] };
      buckets.set(entry.key, bucket);
      bucket.items.push({ item, entry });
    }
  }
  const withSections = grouping?.showSubcategories === true;
  const groups: ServedGroup<T>[] = [...buckets.values()]
    .sort((left, right) => left.entry.order - right.entry.order)
    .map((bucket) => ({
      key: bucket.entry.key,
      title: bucket.entry.title,
      kind: bucket.entry.kind,
      ...arranged(bucket.items, compare, withSections),
      roles: rolesOf(bucket.items, entriesOf),
    }));
  if (ungrouped.length > 0) {
    groups.push({
      key: UNGROUPED_KEY,
      title: SHELF_LABEL_UNKNOWN,
      kind: null,
      lines: [...ungrouped].sort(compare),
      intertitles: new Map(),
      roles: new Map(),
    });
  }
  return groups;
}

/** Le rôle de chaque ligne du groupe dont le produit a plusieurs postes. */
function rolesOf<T extends { readonly sku: string }>(
  items: readonly { readonly item: T; readonly entry: ProductionGroupingEntryView }[],
  entriesOf: ReadonlyMap<string, readonly ProductionGroupingEntryView[]>,
): ReadonlyMap<string, WorkshopLineRole> {
  const roles = new Map<string, WorkshopLineRole>();
  for (const { item, entry } of items) {
    if (entry.role != null && (entriesOf.get(item.sku)?.length ?? 0) > 1) {
      roles.set(item.sku, entry.role);
    }
  }
  return roles;
}

/**
 * Les lignes de tous les groupes, chacune une fois : une ligne répétée sous
 * plusieurs postes ne compte qu'une fois dans un total général.
 */
export function distinctBySku<T extends { readonly sku: string }>(
  groups: readonly { readonly lines: readonly T[] }[],
): readonly T[] {
  const seen = new Map<string, T>();
  for (const group of groups) {
    for (const line of group.lines) {
      if (!seen.has(line.sku)) {
        seen.set(line.sku, line);
      }
    }
  }
  return [...seen.values()];
}

/** Les lignes d'un groupe : à plat, ou section par section avec leurs intertitres. */
function arranged<T extends { readonly sku: string }>(
  items: readonly { readonly item: T; readonly entry: ProductionGroupingEntryView }[],
  compare: (left: T, right: T) => number,
  withSections: boolean,
): { readonly lines: readonly T[]; readonly intertitles: ReadonlyMap<string, string> } {
  if (!withSections) {
    return { lines: items.map(({ item }) => item).sort(compare), intertitles: new Map() };
  }
  const sections = new Map<number, { label: string | null; items: T[] }>();
  for (const { item, entry } of items) {
    const order = entry.section?.order ?? -1;
    const section = sections.get(order) ?? { label: entry.section?.label ?? null, items: [] };
    sections.set(order, section);
    section.items.push(item);
  }
  const intertitles = new Map<string, string>();
  const lines = [...sections.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([, section]) => {
      const sorted = [...section.items].sort(compare);
      const first = sorted[0];
      if (section.label !== null && first !== undefined) {
        intertitles.set(first.sku, section.label);
      }
      return sorted;
    });
  return { lines, intertitles };
}
