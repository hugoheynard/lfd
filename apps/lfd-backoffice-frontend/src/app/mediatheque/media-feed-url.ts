import type { ParamMap, Params } from '@angular/router';
import { MEDIA_LIBRARY_SORTS, type MediaLibrarySort } from '@lfd/pim-contracts';

import type { MediaPageRequest } from './media-library-http-api';
import { civilDayLabel } from './paris-calendar';

/**
 * **Ce que la médiathèque montre** — le tri et les filtres, tels que
 * l'adresse les porte (`mediatheque.md` §5).
 *
 * Patron repris de `admin/journal/journal-url.ts`. Une différence, voulue :
 * la recherche `q` y entre. Le journal l'écarte parce qu'un terme cherché peut
 * y être un nom de personne ; ici, on cherche une ÉTIQUETTE d'image.
 *
 * Le curseur n'y entre jamais : il dit où l'on en était d'une lecture, pas ce
 * qu'on regarde, et un lien partagé doit rouvrir la vue depuis son début.
 *
 * `''` et `false` valent « pas de filtre ».
 */
export interface MediaFeedCriteria {
  readonly sort: MediaLibrarySort;
  readonly q: string;
  readonly tags: readonly string[];
  /** Premier jour de dépôt, `AAAA-MM-JJ`, inclus. */
  readonly from: string;
  /** Dernier jour de dépôt, `AAAA-MM-JJ`, inclus. */
  readonly to: string;
  /**
   * Premier et dernier jour de PRISE DE VUE (série, sinon dépôt), inclus —
   * posés par un clic sur la frise des couleurs.
   */
  readonly shotFrom: string;
  readonly shotTo: string;
  readonly untagged: boolean;
  readonly unused: boolean;
  /** L'identifiant d'une série ; `''` = toutes. */
  readonly series: string;
}

/** Tout le fonds, du plus récent au plus ancien — l'ordre du serveur par défaut. */
export const ALL_MEDIA: MediaFeedCriteria = {
  sort: 'deposited',
  q: '',
  tags: [],
  from: '',
  to: '',
  shotFrom: '',
  shotTo: '',
  untagged: false,
  unused: false,
  series: '',
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isSort(value: string): value is MediaLibrarySort {
  return MEDIA_LIBRARY_SORTS.some((sort) => sort === value);
}

function readDay(params: ParamMap, key: string): string {
  const raw = params.get(key) ?? '';
  return DAY.test(raw) ? raw : '';
}

function readFlag(params: ParamMap, key: string): boolean {
  const raw = params.get(key);
  return raw === '1' || raw === 'true';
}

/**
 * Ce que l'adresse demande. Une valeur illisible vaut « pas de filtre » : un
 * lien périmé ou retouché à la main ouvre la médiathèque, il ne la vide pas
 * sur un critère que le serveur refuserait.
 */
export function readCriteria(params: ParamMap): MediaFeedCriteria {
  const sort = params.get('sort') ?? '';
  const tags = (params.get('tags') ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
  return {
    sort: isSort(sort) ? sort : ALL_MEDIA.sort,
    q: (params.get('q') ?? '').trim(),
    tags: [...new Set(tags)],
    from: readDay(params, 'from'),
    to: readDay(params, 'to'),
    shotFrom: readDay(params, 'shotFrom'),
    shotTo: readDay(params, 'shotTo'),
    untagged: readFlag(params, 'untagged'),
    unused: readFlag(params, 'unused'),
    // Opaque, comme un curseur : une série inconnue rend une grille vide, et
    // « Tout afficher » la défait — l'écran ne connaît pas la liste au
    // moment où il lit l'adresse.
    series: (params.get('series') ?? '').trim(),
  };
}

/**
 * Ce qu'on écrit dans l'adresse. Un critère à sa valeur par défaut part à
 * `null`, qui **retire** la clé sous `queryParamsHandling: 'merge'` : la vue
 * par défaut a l'adresse nue.
 */
export function toQueryParams(criteria: MediaFeedCriteria): Params {
  return {
    sort: criteria.sort === ALL_MEDIA.sort ? null : criteria.sort,
    q: criteria.q === '' ? null : criteria.q,
    tags: criteria.tags.length === 0 ? null : criteria.tags.join(','),
    from: criteria.from === '' ? null : criteria.from,
    to: criteria.to === '' ? null : criteria.to,
    shotFrom: criteria.shotFrom === '' ? null : criteria.shotFrom,
    shotTo: criteria.shotTo === '' ? null : criteria.shotTo,
    untagged: criteria.untagged ? '1' : null,
    unused: criteria.unused ? '1' : null,
    series: criteria.series === '' ? null : criteria.series,
  };
}

export function sameCriteria(a: MediaFeedCriteria, b: MediaFeedCriteria): boolean {
  return (
    a.sort === b.sort &&
    a.q === b.q &&
    a.from === b.from &&
    a.to === b.to &&
    a.shotFrom === b.shotFrom &&
    a.shotTo === b.shotTo &&
    a.untagged === b.untagged &&
    a.unused === b.unused &&
    a.series === b.series &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, index) => b.tags[index] === tag)
  );
}

/**
 * Un filtre est-il posé ? Le TRI n'en est pas un : il range le fonds, il n'en
 * cache rien — « Tout afficher » n'a rien à défaire après un simple tri.
 */
export function isFiltering(criteria: MediaFeedCriteria): boolean {
  return (
    criteria.q !== '' ||
    criteria.tags.length > 0 ||
    criteria.from !== '' ||
    criteria.to !== '' ||
    criteria.shotFrom !== '' ||
    criteria.shotTo !== '' ||
    criteria.untagged ||
    criteria.unused ||
    criteria.series !== ''
  );
}

/** Les mêmes critères, débarrassés des filtres ; le tri est gardé. */
export function withoutFilters(criteria: MediaFeedCriteria): MediaFeedCriteria {
  return { ...ALL_MEDIA, sort: criteria.sort };
}

/** La demande d'une page, à partir des critères et du curseur de la précédente. */
export function toPageRequest(
  criteria: MediaFeedCriteria,
  limit: number,
  after: string | null,
): MediaPageRequest {
  return {
    limit,
    ...(after === null ? {} : { after }),
    sort: criteria.sort,
    q: criteria.q,
    tags: criteria.tags,
    from: criteria.from,
    to: criteria.to,
    shotFrom: criteria.shotFrom,
    shotTo: criteria.shotTo,
    untagged: criteria.untagged,
    unused: criteria.unused,
    series: criteria.series,
  };
}

/** Un jour nu en toutes lettres ; mal formé (adresse retouchée), il se dit tel quel. */
function dayLabel(day: string): string {
  return civilDayLabel(day) ?? day;
}

/**
 * La pastille de la période de prise de vue : « Prises du 3 octobre
 * 2026 au 9 octobre 2026 », « Prises le 3 octobre 2026 », ou `null` sans
 * période. Une borne seule vient d'une adresse retouchée ; elle se dit aussi.
 */
export function shotRangeLabel(criteria: MediaFeedCriteria): string | null {
  const { shotFrom, shotTo } = criteria;
  if (shotFrom !== '' && shotTo !== '') {
    return shotFrom === shotTo
      ? `Prises le ${dayLabel(shotFrom)}`
      : `Prises du ${dayLabel(shotFrom)} au ${dayLabel(shotTo)}`;
  }
  if (shotFrom !== '') return `Prises depuis le ${dayLabel(shotFrom)}`;
  if (shotTo !== '') return `Prises jusqu'au ${dayLabel(shotTo)}`;
  return null;
}
