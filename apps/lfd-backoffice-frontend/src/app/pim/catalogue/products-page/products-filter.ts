import type { ParamMap, Params } from '@angular/router';

import type { Category, Product } from '../catalogue-api';
import type { ProductStatus } from '../../data/models';

/** « Toutes les familles » — la puce de tête. Absente du contrat, propre à l'écran. */
export const ALL_FAMILIES = '';

/** « Tous les états » — idem. */
export const ALL_STATUSES = '';

/** Ce que l'état peut valoir dans le filtre : un statut, ou tous. */
export type StatusFilter = typeof ALL_STATUSES | ProductStatus;

/** Les trois filtres de la liste, tels que l'URL les retient. */
export interface ProductsFilter {
  readonly family: string;
  readonly status: StatusFilter;
  /** Cache les archivées quand l'état vaut « Toutes ». Activé par défaut. */
  readonly hideArchived: boolean;
}

export const DEFAULT_FILTER: ProductsFilter = {
  family: ALL_FAMILIES,
  status: ALL_STATUSES,
  hideArchived: true,
};

const STATUSES: readonly ProductStatus[] = ['draft', 'published', 'archived'];

/** Noms des paramètres d'URL. Seul ce qui s'écarte du défaut y est écrit. */
const PARAM_FAMILY = 'famille';
const PARAM_STATUS = 'etat';
const PARAM_ARCHIVED = 'archivees';
/** `archivees=visibles` : le masque est levé. */
const ARCHIVED_SHOWN = 'visibles';

/**
 * Le masque n'agit que sur « Toutes » : choisir « Archivées » doit montrer les
 * archivées quelle que soit sa position, sans quoi le filtre ne rendrait rien.
 */
export function maskApplies(filter: ProductsFilter): boolean {
  return filter.status === ALL_STATUSES && filter.hideArchived;
}

/** Les lignes qui passent les trois filtres (la recherche est appliquée à part). */
export function filterProducts(products: readonly Product[], filter: ProductsFilter): Product[] {
  const hide = maskApplies(filter);
  return products.filter(
    (p) =>
      (filter.family === ALL_FAMILIES || p.categoryId === filter.family) &&
      (filter.status === ALL_STATUSES || p.status === filter.status) &&
      !(hide && p.status === 'archived'),
  );
}

/**
 * « Tout », puis une puce par famille qui porte au moins une fiche, dans
 * l'ordre du catalogue (`position`). Une famille vide n'a rien à filtrer.
 */
export function familyOptions(
  categories: readonly Category[],
  products: readonly Product[],
): { value: string; label: string }[] {
  const used = new Set(products.map((p) => p.categoryId));
  return [
    { value: ALL_FAMILIES, label: 'Tout' },
    ...[...categories]
      .filter((c) => used.has(c.id))
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ value: c.id, label: c.name.fr })),
  ];
}

/** Lit les filtres d'une URL ; une valeur inconnue retombe sur le défaut. */
export function filterFromParams(params: ParamMap): ProductsFilter {
  const status = params.get(PARAM_STATUS);
  return {
    family: params.get(PARAM_FAMILY) ?? ALL_FAMILIES,
    status: STATUSES.find((s) => s === status) ?? ALL_STATUSES,
    hideArchived: params.get(PARAM_ARCHIVED) !== ARCHIVED_SHOWN,
  };
}

/** Écrit les filtres en paramètres ; `null` retire un paramètre revenu au défaut. */
export function filterToParams(filter: ProductsFilter): Params {
  return {
    [PARAM_FAMILY]: filter.family === ALL_FAMILIES ? null : filter.family,
    [PARAM_STATUS]: filter.status === ALL_STATUSES ? null : filter.status,
    [PARAM_ARCHIVED]: filter.hideArchived ? null : ARCHIVED_SHOWN,
  };
}
