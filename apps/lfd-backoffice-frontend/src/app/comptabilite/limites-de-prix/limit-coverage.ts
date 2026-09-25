import type { PriceFloorView, PriceScopePayload, PricingBoardView } from '@lfd/contracts';

/**
 * **D'où vient la limite qui s'applique** : la sienne, celle de la famille,
 * celle du catalogue — ou aucune.
 */
export type LimitSource = 'own' | 'category' | 'global' | null;

/**
 * **Le niveau de couverture d'un article.** Une entreprise structurée a des
 * limites partout : c'est ce qui garde la marge (Hugo, 2026-09-25). D'où deux
 * niveaux signalés, et pas un :
 *
 * - `none` — aucune limite ne s'applique, le prix peut descendre à zéro ;
 * - `global-only` — seule la limite du catalogue le protège, une fraction
 *   unique pensée pour tout et donc pour rien de précis.
 *
 * Une limite de famille ou une limite propre couvrent l'article.
 */
export type Coverage = 'covered' | 'global-only' | 'none';

/** Une ligne de portée large — le catalogue ou une famille. */
export interface ScopeLimitRow {
  readonly key: string;
  readonly scope: PriceScopePayload;
  readonly name: string;
  readonly kind: string;
  /** La limite posée sur CETTE portée. */
  readonly own: PriceFloorView | null;
  /** Celle qui s'applique — la sienne, ou celle du catalogue. */
  readonly applied: PriceFloorView | null;
  readonly source: LimitSource;
  readonly parentKey: string | null;
}

/** Une ligne d'article. */
export interface ArticleLimitRow {
  readonly key: string;
  readonly scope: PriceScopePayload;
  readonly sku: string;
  readonly name: string;
  readonly canonicalMillicents: number;
  readonly own: PriceFloorView | null;
  readonly applied: PriceFloorView | null;
  readonly source: LimitSource;
  readonly coverage: Coverage;
  readonly parentKey: string;
}

/** Un rayon : sa famille et ses articles. */
export interface LimitShelf {
  readonly family: ScopeLimitRow;
  readonly articles: readonly ArticleLimitRow[];
}

export interface LimitCoverage {
  readonly catalogue: ScopeLimitRow;
  readonly shelves: readonly LimitShelf[];
}

export const GLOBAL_KEY = 'global:';

export function scopeKey(scope: PriceScopePayload): string {
  return `${scope.type}:${scope.id ?? ''}`;
}

/**
 * **La couverture d'une clientèle**, article par article.
 *
 * Le tableau tarifaire ne donne que la STRUCTURE — familles, articles, tarifs.
 * Les limites viennent de la liste de la clientèle, et l'héritage se calcule
 * ici, par portée : le tableau porte la limite pro qui s'applique, pas la
 * publique, et lire l'une pour l'autre ferait mentir la vue Public.
 *
 * Les limites de déclinaison n'ont pas de ligne : le tableau n'en a pas.
 */
export function limitCoverage(
  board: Pick<PricingBoardView, 'categories'>,
  floors: readonly PriceFloorView[],
): LimitCoverage {
  const byKey = new Map(floors.map((floor) => [scopeKey(floor.scope), floor]));
  const globalFloor = byKey.get(GLOBAL_KEY) ?? null;
  const catalogue: ScopeLimitRow = {
    key: GLOBAL_KEY,
    scope: { type: 'global', id: null },
    name: 'Tout le catalogue',
    kind: 'Catalogue',
    own: globalFloor,
    applied: globalFloor,
    source: globalFloor === null ? null : 'own',
    parentKey: null,
  };
  const shelves = board.categories.map((category): LimitShelf => {
    const familyScope: PriceScopePayload = { type: 'category', id: category.id };
    const familyKey = scopeKey(familyScope);
    const familyFloor = byKey.get(familyKey) ?? null;
    const family: ScopeLimitRow = {
      key: familyKey,
      scope: familyScope,
      name: category.name,
      kind: 'Famille',
      own: familyFloor,
      applied: familyFloor ?? globalFloor,
      source: familyFloor !== null ? 'own' : globalFloor !== null ? 'global' : null,
      parentKey: GLOBAL_KEY,
    };
    const articles = category.items.map((item): ArticleLimitRow => {
      const scope: PriceScopePayload = { type: 'product', id: item.sku };
      const key = scopeKey(scope);
      const own = byKey.get(key) ?? null;
      const source: LimitSource =
        own !== null
          ? 'own'
          : familyFloor !== null
            ? 'category'
            : globalFloor !== null
              ? 'global'
              : null;
      return {
        key,
        scope,
        sku: item.sku,
        name: item.name,
        canonicalMillicents: item.canonicalMillicents,
        own,
        applied: own ?? familyFloor ?? globalFloor,
        source,
        coverage: source === null ? 'none' : source === 'global' ? 'global-only' : 'covered',
        parentKey: familyKey,
      };
    });
    return { family, articles };
  });
  return { catalogue, shelves };
}

/** Ce que la ligne écrit de la provenance. */
export const SOURCE_LABELS: Readonly<Record<Exclude<LimitSource, null>, string>> = {
  own: 'propre',
  category: 'héritée de la famille',
  global: 'héritée du catalogue',
};

/** Le filtre de la vue : tout, les seuls sans limite, ou tout ce qui est à couvrir. */
export type CoverageFilter = 'all' | 'none' | 'to-cover';

export function matchesFilter(row: ArticleLimitRow, filter: CoverageFilter): boolean {
  if (filter === 'none') {
    return row.coverage === 'none';
  }
  if (filter === 'to-cover') {
    return row.coverage !== 'covered';
  }
  return true;
}
