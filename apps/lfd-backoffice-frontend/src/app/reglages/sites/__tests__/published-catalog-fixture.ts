import type {
  PublishedCatalogView,
  PublishedCellCounts,
  PublishedEntryStatus,
  PublishedEntryView,
  PublishedShelfView,
} from '@lfd/contracts';

const NO_COUNTS: PublishedCellCounts = {
  inactif: 0,
  en_vente: 0,
  masque: 0,
  pas_vendu: 0,
  en_attente_validation: 0,
  incomplet: 0,
};

/** Un rayon du catalogue publié, sans compte : seules l'identité et le retrait comptent ici. */
export function shelf(categoryId: string, name: string, withdrawn = false): PublishedShelfView {
  return { categoryId, name, position: 0, withdrawn, pro: NO_COUNTS, public: NO_COUNTS };
}

/** Une fiche du catalogue publié, sans déclinaison. */
export function entry(
  productId: string,
  name: string,
  categoryId: string,
  status: PublishedEntryStatus = 'active',
): PublishedEntryView {
  return {
    productId,
    productSku: productId,
    name,
    categoryId,
    status,
    audience: 'both',
    audienceInherited: true,
    familyAudience: null,
    variants: [],
    receivedAt: '2026-01-01T00:00:00.000Z',
  };
}

export function publishedCatalog(
  shelves: readonly PublishedShelfView[],
  entries: readonly PublishedEntryView[],
): PublishedCatalogView {
  return { shelves, entries, pendingReview: [] };
}
