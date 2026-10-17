import type {
  CatalogAdminItemView,
  CatalogItemAudience,
  PublishedCatalogView,
  PublishedCellCounts,
  PublishedEntryView,
  PublishedVariantView,
} from '@lfd/contracts';

/**
 * **La vue « Catalogue publié », mise en lignes** — ce que l'écran dérive du
 * contrat `PublishedCatalogView`, sans rien recalculer de ce que le serveur
 * décide : les états de cellule, les comptes et l'ordre viennent de lui.
 *
 * Fonctions pures, hors du composant : ce sont des règles (qu'est-ce qu'un
 * article « vu des pros » ?), et une règle dans un gabarit n'est atteinte par
 * aucun test.
 */

/**
 * Une ligne de la table : UNE déclinaison d'une fiche, et — si elle est en
 * vente sur la plateforme — la ligne du paramétrage qui porte ses décisions de
 * prix (`GET admin/catalog`).
 *
 * `item` est `null` pour une déclinaison que la plateforme ne vend pas (fiche
 * inactive, déclinaison incomplète) : il n'y a alors aucun prix décidé à
 * montrer, ni de geste de prix à offrir — le serveur n'a pas de ligne où
 * l'écrire.
 */
export interface PublishedRow {
  readonly entry: PublishedEntryView;
  readonly variant: PublishedVariantView;
  readonly item: CatalogAdminItemView | null;
}

/** Un rayon, ses comptes par audience, et ses lignes retenues par le filtre. */
export interface PublishedShelf {
  readonly id: string;
  readonly name: string;
  readonly withdrawn: boolean;
  readonly pro: PublishedCellCounts;
  readonly public: PublishedCellCounts;
  readonly rows: readonly PublishedRow[];
}

/** Les lectures du filtre de tête. Des clés, pas des libellés. */
export const PUBLISHED_FILTERS = ['all', 'pro', 'public', 'masked', 'pending', 'inactive'] as const;
export type PublishedFilter = (typeof PUBLISHED_FILTERS)[number];

const FILTER_LABELS: Readonly<Record<PublishedFilter, string>> = {
  all: 'Tout',
  pro: 'Vu des pros',
  public: 'Vu du public',
  masked: 'Masqué',
  pending: 'En attente',
  inactive: 'Inactif',
};

export function filterLabel(filter: PublishedFilter): string {
  return FILTER_LABELS[filter];
}

/**
 * Les lignes, fiche par fiche, dans l'ordre du serveur (rayon, puis nom ; puis
 * les déclinaisons en vente, les complètes, les incomplètes).
 */
export function rowsOf(
  view: PublishedCatalogView,
  items: readonly CatalogAdminItemView[],
): readonly PublishedRow[] {
  const bySku = new Map(items.map((item) => [item.sku, item]));
  return view.entries.flatMap((entry) =>
    entry.variants.map((variant) => ({
      entry,
      variant,
      item: bySku.get(variant.sku) ?? null,
    })),
  );
}

/**
 * La ligne entre-t-elle dans la lecture choisie ?
 *
 * « Vu des pros » et « vu du public » ne retiennent que ce que l'audience voit
 * VRAIMENT (`en_vente`) : c'est la question « qu'est-ce qu'un particulier voit
 * aujourd'hui ? » (D7), et un article masqué ou en attente n'en fait pas partie.
 */
export function keptBy(row: PublishedRow, filter: PublishedFilter): boolean {
  const { pro, public: pub } = row.variant;
  switch (filter) {
    case 'all':
      return true;
    case 'pro':
      return pro.state === 'en_vente';
    case 'public':
      return pub.state === 'en_vente';
    case 'masked':
      return pro.state === 'masque' || pub.state === 'masque';
    case 'pending':
      return pro.state === 'en_attente_validation' || pub.state === 'en_attente_validation';
    case 'inactive':
      return isInactive(row);
  }
}

/**
 * Les audiences qui attendent la validation de cette ligne, dans l'ordre pros
 * puis boutique — vide quand elle n'attend rien. Lu sur l'état des cellules,
 * comme le filtre « En attente » : la note sous la ligne et le filtre ne
 * peuvent pas se contredire.
 */
export function pendingAudiences(row: PublishedRow): readonly ('pro' | 'public')[] {
  const audiences: ('pro' | 'public')[] = [];
  if (row.variant.pro.state === 'en_attente_validation') {
    audiences.push('pro');
  }
  if (row.variant.public.state === 'en_attente_validation') {
    audiences.push('public');
  }
  return audiences;
}

/** La fiche n'est pas active : la ligne se grise, ses cellules disent « inactive ». */
export function isInactive(row: PublishedRow): boolean {
  return row.entry.status !== 'active';
}

/** Le nom de la ligne : celui de la déclinaison, sinon celui de la fiche (déclinaison incomplète). */
export function rowName(row: PublishedRow): string {
  return row.variant.name ?? row.entry.name;
}

/** Nom ou référence, sans accent ni casse — on tape « pate » et « Pâté » sort. */
export function matches(row: PublishedRow, needle: string): boolean {
  return (
    needle === '' ||
    normalize(rowName(row)).includes(needle) ||
    normalize(row.variant.sku).includes(needle) ||
    normalize(row.entry.productSku).includes(needle)
  );
}

export function normalize(value: string): string {
  return value.toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/gu, '');
}

/**
 * Les rayons dans l'ordre du serveur, chacun avec ses lignes retenues. Un rayon
 * dont aucune ligne ne passe n'est pas rendu : une table vide sous chaque
 * famille noierait les trois qui répondent.
 */
export function shelvesOf(
  view: PublishedCatalogView,
  rows: readonly PublishedRow[],
): readonly PublishedShelf[] {
  return view.shelves
    .map((shelf) => ({
      id: shelf.categoryId,
      name: shelf.name ?? shelf.categoryId,
      withdrawn: shelf.withdrawn,
      pro: shelf.pro,
      public: shelf.public,
      rows: rows.filter((row) => row.entry.categoryId === shelf.categoryId),
    }))
    .filter((shelf) => shelf.rows.length > 0);
}

const AUDIENCE_LABELS: Readonly<Record<CatalogItemAudience, string>> = {
  pro: 'Pros',
  public: 'Public',
  both: 'Pros et public',
};

export function audienceLabel(audience: CatalogItemAudience): string {
  return AUDIENCE_LABELS[audience];
}

/**
 * D'où vient l'audience : « famille » quand la fiche hérite, « fiche » quand
 * elle y déroge. `null` — un fait reçu avant le lot 3 — ne dit rien : on ne
 * sait pas, et l'écran ne l'invente pas.
 */
export function audienceOrigin(inherited: boolean | null): string | null {
  if (inherited === null) {
    return null;
  }
  return inherited ? 'famille' : 'fiche';
}

/** Ce qu'un manque se dit à l'écran. Les codes sont ceux du référentiel. */
const GAP_LABELS: Readonly<Record<string, string>> = {
  price: 'prix',
  allergens: 'allergènes',
  pro_price: 'prix pro',
  pro_price_rule: 'rapport pro',
};
const VAT_GAP_PREFIX = 'vat:';

export function gapLabel(gap: string): string {
  if (gap.startsWith(VAT_GAP_PREFIX)) {
    return `taux de TVA « ${gap.slice(VAT_GAP_PREFIX.length)} »`;
  }
  return GAP_LABELS[gap] ?? gap;
}

/**
 * Les comptes d'un rayon pour une audience, en une phrase courte : seuls les
 * états présents. « 12 en vente · 2 masqués · 1 en attente ».
 */
export function countsLabel(counts: PublishedCellCounts): string {
  const parts = [
    plural(counts.en_vente, 'en vente', 'en vente'),
    plural(counts.masque, 'masqué', 'masqués'),
    plural(counts.en_attente_validation, 'en attente', 'en attente'),
    plural(counts.incomplet, 'incomplet', 'incomplets'),
    plural(counts.inactif, 'inactif', 'inactifs'),
  ].filter((part) => part !== null);
  return parts.length === 0 ? 'rien' : parts.join(' · ');
}

function plural(count: number, one: string, many: string): string | null {
  if (count === 0) {
    return null;
  }
  return `${String(count)} ${count > 1 ? many : one}`;
}
