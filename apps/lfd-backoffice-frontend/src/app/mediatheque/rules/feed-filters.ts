import { ALL_MEDIA, type MediaFeedCriteria } from './media-feed-url';
import type { MediaPageRequest } from './media-page-request';
import { civilDayLabel } from './paris-calendar';

/**
 * **Ce que les critères filtrent** — s'il y a un filtre, comment le défaire,
 * ce qu'on demande au serveur, et comment se dit la période de prise de vue.
 * L'adresse, elle, vit dans `media-feed-url.ts`.
 */

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
