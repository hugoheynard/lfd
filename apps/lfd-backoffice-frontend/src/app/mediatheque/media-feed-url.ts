import type { ParamMap, Params } from '@angular/router';
import { MEDIA_LIBRARY_SORTS, type MediaLibrarySort } from '@lfd/pim-contracts';

import type { MediaPageRequest } from './media-library-http-api';

/**
 * **Ce que la médiathèque montre** — le tri et les filtres, tels que
 * l'adresse les porte (plan L2, point 5).
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
  readonly untagged: boolean;
  readonly unused: boolean;
  /** L'identifiant d'une série (L3) ; `''` = toutes. */
  readonly series: string;
}

/** Tout le fonds, du plus récent au plus ancien — l'ordre du serveur par défaut. */
export const ALL_MEDIA: MediaFeedCriteria = {
  sort: 'deposited',
  q: '',
  tags: [],
  from: '',
  to: '',
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
    untagged: criteria.untagged,
    unused: criteria.unused,
    series: criteria.series,
  };
}
