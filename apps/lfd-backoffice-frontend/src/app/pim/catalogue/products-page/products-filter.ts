import type { ParamMap, Params } from '@angular/router';

import type { Category, Product } from '../catalogue-api';
import type { ProductStatus } from '../../data/models';
import type { ComplianceState } from '../product-compliance';

/** « Toutes les familles » — la puce de tête. Absente du contrat, propre à l'écran. */
export const ALL_FAMILIES = '';

/** « Tous les états » — idem. */
export const ALL_STATUSES = '';

/**
 * « Activables » — les brouillons qu'une activation accepterait. Valeur
 * d'URL dans la langue des statuts (`etat=draft`), décidé le 2026-10-26.
 */
export const ACTIVATABLE = 'activatable';

/**
 * « Bloquants » / « À vérifier » — le pire constat de conformité que le serveur
 * porte sur la fiche (`compliance-warnings`). Même mécanique qu'« Activables ».
 */
export const NON_COMPLIANT_LIVE = 'non_compliant_live';
export const BLOCKING = 'blocking';
export const TO_REVIEW = 'to_review';

/**
 * « Sans information précise » — les fiches dont une déclinaison est publiée
 * par précaution, sans déclaration d'allergènes (constat
 * `allergens_precautionary`, `plan-allergenes-jamais-bloquants.md`).
 */
export const PRECAUTIONARY = 'precautionary';

/** Ce que l'état peut valoir dans le filtre : un statut, un jugement du serveur, ou tous. */
export type StatusFilter =
  | typeof ALL_STATUSES
  | typeof ACTIVATABLE
  | typeof NON_COMPLIANT_LIVE
  | typeof BLOCKING
  | typeof TO_REVIEW
  | typeof PRECAUTIONARY
  | ProductStatus;

/** Le pire constat d'une fiche, `null` sans constat — lu, jamais jugé ici. */
export type ComplianceStateOf = (product: Product) => ComplianceState | null;

const NO_FINDING: ComplianceStateOf = () => null;

/** La fiche porte-t-elle le constat de précaution ? Lu, jamais jugé ici. */
export type PrecautionaryOf = (product: Product) => boolean;

const NOT_PRECAUTIONARY: PrecautionaryOf = () => false;

/** Les filtres de la liste, tels que l'URL les retient. */
export interface ProductsFilter {
  readonly family: string;
  readonly status: StatusFilter;
  /** Cache les archivées quand l'état vaut « Toutes ». Activé par défaut. */
  readonly hideArchived: boolean;
  /** Ne garde que les fiches sans aucune image (Hugo, 2026-10-28). */
  readonly withoutImages: boolean;
}

export const DEFAULT_FILTER: ProductsFilter = {
  family: ALL_FAMILIES,
  status: ALL_STATUSES,
  hideArchived: true,
  withoutImages: false,
};

const STATUSES: readonly StatusFilter[] = [
  'draft',
  'published',
  'archived',
  ACTIVATABLE,
  NON_COMPLIANT_LIVE,
  BLOCKING,
  TO_REVIEW,
  PRECAUTIONARY,
];

/** Noms des paramètres d'URL. Seul ce qui s'écarte du défaut y est écrit. */
const PARAM_FAMILY = 'famille';
const PARAM_STATUS = 'etat';
const PARAM_ARCHIVED = 'archivees';
const PARAM_IMAGES = 'images';
/** `images=sans` : seules les fiches sans image. */
const IMAGES_NONE = 'sans';
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
export function filterProducts(
  products: readonly Product[],
  filter: ProductsFilter,
  stateOf: ComplianceStateOf = NO_FINDING,
  precautionaryOf: PrecautionaryOf = NOT_PRECAUTIONARY,
): Product[] {
  const hide = maskApplies(filter);
  return products.filter(
    (p) =>
      (filter.family === ALL_FAMILIES || p.categoryId === filter.family) &&
      (filter.status === PRECAUTIONARY
        ? precautionaryOf(p)
        : statusMatches(p, filter.status, stateOf)) &&
      !(hide && p.status === 'archived') &&
      // Une liste qui ne dit rien (`illustrated` absent) ne passe pas pour sans image.
      (!filter.withoutImages || p.illustrated === false),
  );
}

/**
 * « Activables » lit le jugement du serveur, jamais le statut : une fiche dont
 * la liste ne dit rien (`activatable` absent) n'est pas activable.
 */
function statusMatches(
  product: Product,
  status: StatusFilter,
  stateOf: ComplianceStateOf,
): boolean {
  if (status === ACTIVATABLE) {
    return product.activatable === true;
  }
  if (status === NON_COMPLIANT_LIVE || status === BLOCKING) {
    return stateOf(product) === status;
  }
  if (status === TO_REVIEW) {
    return stateOf(product) === 'warning';
  }
  return status === ALL_STATUSES || product.status === status;
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
    withoutImages: params.get(PARAM_IMAGES) === IMAGES_NONE,
  };
}

/** Écrit les filtres en paramètres ; `null` retire un paramètre revenu au défaut. */
export function filterToParams(filter: ProductsFilter): Params {
  return {
    [PARAM_FAMILY]: filter.family === ALL_FAMILIES ? null : filter.family,
    [PARAM_STATUS]: filter.status === ALL_STATUSES ? null : filter.status,
    [PARAM_ARCHIVED]: filter.hideArchived ? null : ARCHIVED_SHOWN,
    [PARAM_IMAGES]: filter.withoutImages ? IMAGES_NONE : null,
  };
}
