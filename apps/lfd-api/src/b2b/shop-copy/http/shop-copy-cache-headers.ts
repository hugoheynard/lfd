/**
 * Combien de temps un navigateur sert les textes sans redemander. Court : une
 * publication doit se voir dans la minute, et une revalidation coûte une
 * réponse `304` vide servie depuis la mémoire de l'API.
 */
export const SHOP_COPY_MAX_AGE_S = 60;

/**
 * Pendant combien de temps, au-delà, une copie périmée se sert TOUT DE SUITE
 * pendant qu'elle se revalide en arrière-plan : la boutique ne bloque jamais
 * son démarrage sur une revalidation.
 */
export const SHOP_COPY_STALE_WHILE_REVALIDATE_S = 600;

export const SHOP_COPY_CACHE_CONTROL = `public, max-age=${SHOP_COPY_MAX_AGE_S}, stale-while-revalidate=${SHOP_COPY_STALE_WHILE_REVALIDATE_S}`;

/** L'étiquette d'une réponse : la version publiée et la langue — rien d'autre ne la change. */
export function shopCopyEtag(version: number, locale: string): string {
  return `"shop-copy-v${version}-${locale}"`;
}

/**
 * La réponse est-elle celle que le client a déjà ? `If-None-Match` peut porter
 * une liste, et une étiquette faible (`W/`) vaut la forte pour un `GET`.
 */
export function clientHasEtag(ifNoneMatch: string | undefined, etag: string): boolean {
  if (ifNoneMatch === undefined) {
    return false;
  }
  return ifNoneMatch
    .split(",")
    .map((tag) => tag.trim().replace(/^W\//u, ""))
    .some((tag) => tag === etag || tag === "*");
}
