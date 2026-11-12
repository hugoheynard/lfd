import {
  pendingReviewOf,
  publishedShelvesOf,
  type PendingReviewCandidate,
  type PublishedCatalogView,
  type PublishedEntryView,
  type PublishedShelfFamily,
  type PublishedVariantView,
} from "@lfd/contracts";
import { categoryPathOf } from "@lfd/catalog-sync";

import type {
  PublishedCatalogSource,
  PublishedEntryRow,
  PublishedFamilyRow,
  PublishedItemRow,
} from "../../domain/ports/published-catalog.reader.js";
import type { EntryVariant } from "../../domain/catalog-product-facts.js";
import { publishedCellOf } from "../../domain/published-catalog-cells.js";

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
  const pathOf = (familyId: string) => categoryPathOf(source.families, familyId);
  const entries = [...source.entries, ...pushedEntriesOf(source.entries, itemsByProduct)]
    .sort((a, b) => familyRank(familyOf, a) - familyRank(familyOf, b))
    .map((entry) =>
      entryViewOf(entry, itemsByProduct.get(entry.productId) ?? [], {
        family: familyOf.get(entry.categoryId),
        categoryPath: pathOf(entry.categoryId),
      }),
    );
  return {
    shelves: publishedShelvesOf(source.families.map(shelfFamilyOf), entries),
    entries,
    pendingReview: pendingReviewOf(source.items.map(pendingCandidateOf)),
  };
}

/** La famille connue, telle qu'un rayon la montre. */
export function shelfFamilyOf(family: PublishedFamilyRow): PublishedShelfFamily {
  return {
    categoryId: family.id,
    name: family.name,
    position: family.position,
    withdrawn: family.withdrawn,
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
  lineage: {
    readonly family: PublishedFamilyRow | undefined;
    readonly categoryPath: readonly string[];
  },
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
    categoryPath: lineage.categoryPath,
    status: entry.status,
    audience: entry.audience,
    audienceInherited: entry.audienceInherited,
    familyAudience: lineage.family?.audience ?? null,
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
      // Sans prix pro (2026-10-27), l'article n'est pas servi aux pros, comme sans taux.
      billableTo: {
        pro: item.vatRatePercent !== null && item.proHtMillicents !== null,
        public: item.publicTtcCents !== null,
      },
    },
  };
  return {
    sku: item.sku,
    name: item.name,
    onSale: true,
    isDefault: item.isDefault,
    saleUnit: item.saleUnit,
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
    saleUnit: null,
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
    saleUnit: null,
    gaps: [...gaps],
    reviewPending: { pro: false, public: false },
    pro: { state: publishedCellOf("pro", input), htMillicents: null },
    public: { state: publishedCellOf("public", input), ttcCents: null },
  };
}

/** L'article en vente, tel que la liste à valider le lit. */
function pendingCandidateOf(item: PublishedItemRow): PendingReviewCandidate {
  return {
    sku: item.sku,
    productId: item.productId,
    productSku: item.productSku,
    name: item.name,
    categoryId: item.categoryId,
    audience: item.audience,
    proReviewPending: item.proReviewPending,
    publicReviewPending: item.publicReviewPending,
    receivedAt: item.receivedAt.toISOString(),
  };
}

/** L'attente d'un article en vente, par audience. */
function reviewPendingOf(item: PublishedItemRow): { pro: boolean; public: boolean } {
  return { pro: item.proReviewPending, public: item.publicReviewPending };
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
