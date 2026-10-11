import type { MediaLibrarySort } from '@lfd/pim-contracts';

/**
 * Ce qu'un écran demande d'une page du fonds. Seul `limit` est obligatoire :
 * un critère absent n'est pas un filtre.
 */
export interface MediaPageRequest {
  readonly limit: number;
  /** Le `next` de la page précédente, rendu tel quel — jamais lu. */
  readonly after?: string | undefined;
  readonly sort?: MediaLibrarySort | undefined;
  readonly q?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  /** Premier jour de dépôt retenu, `AAAA-MM-JJ`, inclus. */
  readonly from?: string | undefined;
  /** Dernier jour de dépôt retenu, `AAAA-MM-JJ`, inclus. */
  readonly to?: string | undefined;
  /** Premier et dernier jour de prise de vue, inclus. */
  readonly shotFrom?: string | undefined;
  readonly shotTo?: string | undefined;
  readonly untagged?: boolean | undefined;
  readonly unused?: boolean | undefined;
  /** L'identifiant d'une série. */
  readonly series?: string | undefined;
}

/**
 * Les paramètres d'URL d'une demande. Un critère vide ne part PAS : envoyer
 * `q=` ferait poser un filtre qui n'en est pas un, et le serveur devrait le
 * défaire.
 *
 * ⚠️ Les tags partent séparés par une VIRGULE, pas en paramètre répété :
 * `?tags=a&tags=b` rend une chaîne quand il y en a un et un tableau quand il
 * y en a deux, et une forme qui change selon le nombre d'éléments est la
 * source d'une classe de bugs qu'un test à un seul tag ne voit pas. Un tag
 * ne contient jamais de virgule — la normalisation d'écriture découpe
 * dessus.
 */
export function pageParams(request: MediaPageRequest): Record<string, string> {
  const params: Record<string, string> = { limit: String(request.limit) };
  const q = request.q?.trim() ?? '';
  if (request.after !== undefined) params['after'] = request.after;
  if (request.sort !== undefined) params['sort'] = request.sort;
  if (q !== '') params['q'] = q;
  if (request.tags !== undefined && request.tags.length > 0)
    params['tags'] = request.tags.join(',');
  if (request.from !== undefined && request.from !== '') params['from'] = request.from;
  if (request.to !== undefined && request.to !== '') params['to'] = request.to;
  if (request.shotFrom !== undefined && request.shotFrom !== '') {
    params['shotFrom'] = request.shotFrom;
  }
  if (request.shotTo !== undefined && request.shotTo !== '') params['shotTo'] = request.shotTo;
  if (request.untagged === true) params['untagged'] = '1';
  if (request.unused === true) params['unused'] = '1';
  if (request.series !== undefined && request.series !== '') params['series'] = request.series;
  return params;
}
