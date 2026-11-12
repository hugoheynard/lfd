// Le chemin conteneur → objets partagés : UN hôte intercepté, et l'objet
// choisi par le préfixe du chemin (`documentation/caching-usage/
// le-rayon-en-cache.md`, § 4).
//
// Deux hôtes fictifs interceptés (`rayons.interne`, `journees.interne`) ont
// livré en production les appels de l'objet des journées à l'objet des rayons
// (constaté le 2026-11-12 : les deux `/metrics` rendaient les compteurs
// `pro-shelves`), alors que le même code les sépare sous `wrangler dev`. Le
// préfixe du chemin ne dépend d'aucun choix d'hôte du runtime : c'est lui qui
// aiguille.
//
// Zéro import, des fonctions pures, testables sous Node : `worker.ts` ne fait
// que relier la décision aux liaisons des objets.

/** L'hôte fictif unique que le conteneur appelle, et que le Worker intercepte. */
export const INTERNAL_OBJECTS_HOST = "objets.interne";

/** Les objets que le conteneur joint par ce chemin. */
export type InternalObject = "pro-shelves" | "day-versions";

/** Le préfixe de chemin de chaque objet — la seule chose qui aiguille. */
export const INTERNAL_OBJECT_PREFIXES: Readonly<Record<InternalObject, string>> = {
  "pro-shelves": "/rayons",
  "day-versions": "/journees",
};

/** L'adresse de l'objet des rayons, posée par le Worker dans `SHOP_SHELF_CACHE_URL`. */
export const SHELF_STORE_ORIGIN = `http://${INTERNAL_OBJECTS_HOST}${INTERNAL_OBJECT_PREFIXES["pro-shelves"]}`;

/** L'adresse de l'objet des journées, posée par le Worker dans `DAY_VERSIONS_CACHE_URL`. */
export const DAY_VERSIONS_ORIGIN = `http://${INTERNAL_OBJECTS_HOST}${INTERNAL_OBJECT_PREFIXES["day-versions"]}`;

/**
 * Les anciens hôtes, un par objet, encore interceptés le temps d'UN
 * déploiement : un conteneur démarré avant la bascule garde dans son
 * environnement les anciennes adresses, sans préfixe. Ils se retirent au
 * déploiement suivant.
 */
export const LEGACY_OBJECT_HOSTS: Readonly<Record<string, InternalObject>> = {
  "rayons.interne": "pro-shelves",
  "journees.interne": "day-versions",
};

/** Où un appel intercepté va, et le chemin que l'objet doit lire. */
export interface InternalObjectRoute {
  readonly object: InternalObject;
  /** Le chemin sans le préfixe : celui que les objets comprennent. */
  readonly pathname: string;
}

/**
 * Aiguille un appel intercepté. Sur l'hôte unique, par le préfixe du chemin ;
 * sur un ancien hôte, par l'hôte (chemin inchangé). `null` = aucun objet :
 * le Worker répond 404, et l'API retombe sur la base.
 */
export function internalObjectRouteOf(url: URL): InternalObjectRoute | null {
  if (url.hostname === INTERNAL_OBJECTS_HOST) {
    return routeByPrefix(url.pathname);
  }
  const legacy = LEGACY_OBJECT_HOSTS[url.hostname];
  return legacy === undefined ? null : { object: legacy, pathname: url.pathname };
}

function routeByPrefix(pathname: string): InternalObjectRoute | null {
  for (const [object, prefix] of Object.entries(INTERNAL_OBJECT_PREFIXES)) {
    if (pathname.startsWith(`${prefix}/`) && isInternalObject(object)) {
      return { object, pathname: pathname.slice(prefix.length) };
    }
  }
  return null;
}

function isInternalObject(value: string): value is InternalObject {
  return value in INTERNAL_OBJECT_PREFIXES;
}

/** L'URL que l'objet reçoit : même hôte et même requête, chemin sans préfixe. */
export function objectUrlOf(url: URL, route: InternalObjectRoute): URL {
  const forwarded = new URL(url.href);
  forwarded.pathname = route.pathname;
  return forwarded;
}
