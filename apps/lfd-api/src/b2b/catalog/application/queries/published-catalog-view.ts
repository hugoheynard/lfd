import type {
  PendingReviewView,
  PublishedCatalogView,
  PublishedCellCounts,
  PublishedEntryView,
  PublishedShelfView,
  PublishedVariantView,
} from "@lfd/contracts";

import type {
  PublishedCatalogSource,
  PublishedEntryRow,
  PublishedFamilyRow,
  PublishedItemRow,
} from "../../domain/ports/published-catalog.reader.js";
import type { EntryVariant } from "../../domain/catalog-product-facts.js";
import { publishedCellOf, type PublishedCellState } from "../../domain/published-catalog-cells.js";
import type { ShopAudience } from "../../domain/ports/catalog.reader.js";
import { audienceIncludes } from "../../domain/served-to.js";

const SHOP_AUDIENCES: readonly ShopAudience[] = ["pro", "public"];

/**
 * **Compose la vue « Catalogue publié »** depuis les trois lectures — pur,
 * testable sans base.
 *
 * Les fiches viennent des ENTRÉES reçues (`catalog_entries`), pas des
 * articles : une fiche inactive ou sans déclinaison complète paraît. Ses
 * déclinaisons sont celles que la plateforme a en vente, puis celles que le
 * fait déclare incomplètes.
 *
 * 🔴 **Un article encore vendu sans entrée paraît aussi** : tant que les faits
 * ne sont pas ouverts (2b4), le catalogue en production vient du seul push,
 * et `catalog_entries` est vide — l'écran le serait. Ses lignes forment une
 * entrée synthétique par fiche ; une entrée reçue prime toujours.
 */
export function publishedCatalogViewOf(source: PublishedCatalogSource): PublishedCatalogView {
  const itemsByProduct = groupBy(source.items, (item) => item.productId);
  const familyOf = new Map(source.families.map((family) => [family.id, family]));
  const entries = [...source.entries, ...pushedEntriesOf(source.entries, itemsByProduct)]
    .sort((a, b) => familyRank(familyOf, a) - familyRank(familyOf, b))
    .map((entry) =>
      entryViewOf(entry, itemsByProduct.get(entry.productId) ?? [], familyOf.get(entry.categoryId)),
    );
  return {
    shelves: shelvesOf(source.families, entries),
    entries,
    pendingReview: pendingOf(source.items),
  };
}

/**
 * Les fiches connues du seul push : une entrée par `productId` sans entrée
 * reçue, active (ses lignes se vendent), à l'audience de sa ligne par défaut
 * (`null` lu `both`), sans rien dire de l'héritage — le push ne le porte pas.
 */
function pushedEntriesOf(
  entries: readonly PublishedEntryRow[],
  itemsByProduct: ReadonlyMap<string, readonly PublishedItemRow[]>,
): PublishedEntryRow[] {
  const received = new Set(entries.map((entry) => entry.productId));
  return [...itemsByProduct.entries()]
    .filter(([productId]) => !received.has(productId))
    .flatMap(([productId, items]) => {
      const lead = items.find((item) => item.isDefault) ?? items[0];
      return lead === undefined ? [] : [pushedEntryOf(productId, lead, items)];
    });
}

function pushedEntryOf(
  productId: string,
  lead: PublishedItemRow,
  items: readonly PublishedItemRow[],
): PublishedEntryRow {
  const receivedAt = Math.max(...items.map((item) => item.receivedAt.getTime()));
  return {
    productId,
    productSku: lead.productSku,
    name: lead.name,
    categoryId: lead.categoryId,
    status: "active",
    audience: lead.audience ?? "both",
    audienceInherited: null,
    gaps: {},
    variants: [],
    receivedAt: new Date(receivedAt),
  };
}

function entryViewOf(
  entry: PublishedEntryRow,
  items: readonly PublishedItemRow[],
  family: PublishedFamilyRow | undefined,
): PublishedEntryView {
  const onSale = items.map((item) => onSaleViewOf(entry, item));
  const listed = new Set(onSale.map((variant) => variant.sku));
  const proposed = entry.variants
    .filter((variant) => !listed.has(variant.sku))
    .map((variant) => proposedViewOf(entry, variant));
  for (const variant of proposed) {
    listed.add(variant.sku);
  }
  const incomplete = Object.entries(entry.gaps)
    .filter(([sku]) => !listed.has(sku))
    .map(([sku, gaps]) => incompleteViewOf(entry, sku, gaps));
  return {
    productId: entry.productId,
    productSku: entry.productSku,
    name: entry.name,
    categoryId: entry.categoryId,
    status: entry.status,
    audience: entry.audience,
    audienceInherited: entry.audienceInherited,
    familyAudience: family?.audience ?? null,
    variants: [...onSale, ...proposed, ...incomplete],
    receivedAt: entry.receivedAt.toISOString(),
  };
}

/** Ce que la cellule lit de la fiche, sans l'article. */
function cellInputOf(entry: PublishedEntryRow, gaps: readonly string[]) {
  return {
    entryActive: entry.status === "active",
    audience: entry.audience,
    hasGaps: gaps.length > 0,
  };
}

/** Une déclinaison EN VENTE : prix servis, décisions comprises. */
function onSaleViewOf(entry: PublishedEntryRow, item: PublishedItemRow): PublishedVariantView {
  const gaps = entry.gaps[item.sku] ?? [];
  const input = {
    ...cellInputOf(entry, gaps),
    article: {
      isHidden: item.isHidden,
      isHiddenPublic: item.isHiddenPublic,
      reviewPending: reviewPendingOf(item),
      billableTo: { pro: item.vatRatePercent !== null, public: item.publicTtcCents !== null },
    },
  };
  return {
    sku: item.sku,
    name: item.name,
    onSale: true,
    isDefault: item.isDefault,
    gaps: [...gaps],
    reviewPending: reviewPendingOf(item),
    pro: { state: publishedCellOf("pro", input), htMillicents: item.proHtMillicents },
    public: { state: publishedCellOf("public", input), ttcCents: item.publicTtcCents },
  };
}

/** Une déclinaison complète que la plateforme ne vend pas : prix PROPOSÉS par le fait. */
function proposedViewOf(entry: PublishedEntryRow, variant: EntryVariant): PublishedVariantView {
  const input = { ...cellInputOf(entry, []), article: null };
  return {
    sku: variant.sku,
    name: variant.name,
    onSale: false,
    isDefault: variant.isDefault,
    gaps: [],
    reviewPending: { pro: false, public: false },
    pro: { state: publishedCellOf("pro", input), htMillicents: variant.proHtMillicents },
    public: { state: publishedCellOf("public", input), ttcCents: variant.publicTtcCents },
  };
}

/** Une déclinaison incomplète : le fait n'en porte que le SKU et les manques. */
function incompleteViewOf(
  entry: PublishedEntryRow,
  sku: string,
  gaps: readonly string[],
): PublishedVariantView {
  const input = { ...cellInputOf(entry, gaps), article: null };
  return {
    sku,
    name: null,
    onSale: false,
    isDefault: false,
    gaps: [...gaps],
    reviewPending: { pro: false, public: false },
    pro: { state: publishedCellOf("pro", input), htMillicents: null },
    public: { state: publishedCellOf("public", input), ttcCents: null },
  };
}

/** Les rayons : toutes les familles connues, et celles qu'une fiche cite sans être connues. */
function shelvesOf(
  families: readonly PublishedFamilyRow[],
  entries: readonly PublishedEntryView[],
): PublishedShelfView[] {
  const byShelf = groupBy(entries, (entry) => entry.categoryId);
  const known = families.map((family) =>
    shelfOf(family.id, family.name, family.position, family.withdrawn, byShelf.get(family.id)),
  );
  const knownIds = new Set(families.map((family) => family.id));
  const unknown = [...byShelf.keys()]
    .filter((id) => !knownIds.has(id))
    .map((id) => shelfOf(id, null, Number.MAX_SAFE_INTEGER, false, byShelf.get(id)));
  return [...known, ...unknown];
}

function shelfOf(
  categoryId: string,
  name: string | null,
  position: number,
  withdrawn: boolean,
  entries: readonly PublishedEntryView[] = [],
): PublishedShelfView {
  const variants = entries.flatMap((entry) => entry.variants);
  return {
    categoryId,
    name,
    position,
    withdrawn,
    pro: countsOf(variants.map((variant) => variant.pro.state)),
    public: countsOf(variants.map((variant) => variant.public.state)),
  };
}

function countsOf(states: readonly PublishedCellState[]): PublishedCellCounts {
  const counts: Record<PublishedCellState, number> = {
    inactif: 0,
    en_vente: 0,
    masque: 0,
    pas_vendu: 0,
    en_attente_validation: 0,
    incomplet: 0,
  };
  for (const state of states) {
    counts[state] += 1;
  }
  return counts;
}

/** L'attente d'un article en vente, par audience. */
function reviewPendingOf(item: PublishedItemRow): { pro: boolean; public: boolean } {
  return { pro: item.proReviewPending, public: item.publicReviewPending };
}

/** Les audiences qui attendent cet article ET que son audience contient. */
function pendingAudiencesOf(item: PublishedItemRow): ShopAudience[] {
  const pending = reviewPendingOf(item);
  return SHOP_AUDIENCES.filter(
    (audience) => pending[audience] && audienceIncludes(item.audience, audience),
  );
}

/** Le callout : les articles qui attendent une validation, et pour qui. */
function pendingOf(items: readonly PublishedItemRow[]): PendingReviewView[] {
  return items.flatMap((item) => {
    const audiences = pendingAudiencesOf(item);
    return audiences.length === 0 ? [] : [pendingViewOf(item, audiences)];
  });
}

function pendingViewOf(item: PublishedItemRow, audiences: ShopAudience[]): PendingReviewView {
  return {
    sku: item.sku,
    productId: item.productId,
    productSku: item.productSku,
    name: item.name,
    categoryId: item.categoryId,
    audiences,
    receivedAt: item.receivedAt.toISOString(),
  };
}

/** Le rang d'une fiche : la position de sa famille ; l'ordre par nom vient de la lecture. */
function familyRank(
  familyOf: ReadonlyMap<string, PublishedFamilyRow>,
  entry: PublishedEntryRow,
): number {
  return familyOf.get(entry.categoryId)?.position ?? Number.MAX_SAFE_INTEGER;
}

function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [row]);
    } else {
      group.push(row);
    }
  }
  return groups;
}
