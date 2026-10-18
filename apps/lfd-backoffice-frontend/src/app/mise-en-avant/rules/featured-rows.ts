import type { CatalogAdminItemView } from '@lfd/contracts';

import type { ShopAudience } from '../../b2b/catalogue/catalogue.service';

/**
 * Ce qu'une case « mis en avant » peut faire pour une audience :
 *
 * - `open` — la bascule est libre ;
 * - `not_served` — le référentiel ne vend pas l'article à cette audience : le
 *   serveur refuserait (`catalog.item.featuring_outside_audience`) ;
 * - `masked` — l'article est masqué pour elle : le serveur refuserait aussi
 *   (`catalog.item.featured_while_hidden`).
 *
 * Retirer une mise en avant n'est jamais refusé côté serveur : une case
 * fermée mais cochée (une décision d'avant un masquage) reste décochable.
 */
export type FeaturedCellState = 'open' | 'not_served' | 'masked';

/** Une case de la table : son état, coché ou non, et la raison quand elle est fermée. */
export interface FeaturedCell {
  readonly state: FeaturedCellState;
  readonly featured: boolean;
  readonly reason: string | null;
}

/** Une ligne de la table « Mise en avant ». */
export interface FeaturedRow {
  readonly sku: string;
  readonly name: string;
  readonly familyId: string;
  readonly familyName: string;
  readonly pro: FeaturedCell;
  readonly public: FeaturedCell;
}

const NOT_SERVED: Record<ShopAudience, string> = {
  pro: 'Non vendu aux pros (audience du référentiel)',
  public: 'Non vendu au public (audience du référentiel)',
};

const MASKED: Record<ShopAudience, string> = {
  pro: 'Masqué chez les pros : réaffichez-le dans Catalogue publié',
  public: 'Masqué au public : réaffichez-le dans Catalogue publié',
};

/** L'audience (`null` lu `both`, comme le serveur) contient-elle ce lecteur ? */
function serves(item: CatalogAdminItemView, audience: ShopAudience): boolean {
  const effective = item.audience ?? 'both';
  return effective === 'both' || effective === audience;
}

function cellOf(item: CatalogAdminItemView, audience: ShopAudience): FeaturedCell {
  const featured = audience === 'pro' ? item.isFeaturedPro : item.isFeaturedPublic;
  if (!serves(item, audience)) {
    return { state: 'not_served', featured, reason: NOT_SERVED[audience] };
  }
  const masked = audience === 'pro' ? item.isHidden : item.isHiddenPublic;
  if (masked) {
    return { state: 'masked', featured, reason: MASKED[audience] };
  }
  return { state: 'open', featured, reason: null };
}

/** Les lignes de la table, dans l'ordre du catalogue (rayon, position, SKU). */
export function featuredRows(items: readonly CatalogAdminItemView[]): readonly FeaturedRow[] {
  return items.map((item) => ({
    sku: item.sku,
    name: item.name,
    familyId: item.categoryId,
    familyName: item.categoryName,
    pro: cellOf(item, 'pro'),
    public: cellOf(item, 'public'),
  }));
}

/** Les familles présentes, une fois chacune, dans l'ordre d'arrivée. */
export function familiesOf(
  rows: readonly FeaturedRow[],
): readonly { readonly id: string; readonly name: string }[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (!seen.has(row.familyId)) {
      seen.set(row.familyId, row.familyName);
    }
  }
  return [...seen].map(([id, name]) => ({ id, name }));
}

/** Sans casse ni accents : « eclair » trouve « Éclair ». */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').trim();
}

/** Le filtre : une famille (`null` = toutes), et un terme sur le nom ou le SKU. */
export function filterRows(
  rows: readonly FeaturedRow[],
  query: string,
  familyId: string | null,
): readonly FeaturedRow[] {
  const needle = normalize(query);
  return rows.filter(
    (row) =>
      (familyId === null || row.familyId === familyId) &&
      (needle === '' ||
        normalize(row.name).includes(needle) ||
        normalize(row.sku).includes(needle)),
  );
}

/** Combien d'articles sont mis en avant pour une audience — l'en-tête de colonne. */
export function featuredCount(rows: readonly FeaturedRow[], audience: ShopAudience): number {
  return rows.filter((row) => row[audience].featured).length;
}
