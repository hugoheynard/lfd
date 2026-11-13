// La passerelle conteneur → objets partagés, sans runtime Cloudflare
// (`documentation/caching-usage/le-cache-du-back-office.md`, § 3).
//
// `worker.ts` l'inscrit comme gestionnaire de sortie de `Backend` et lui
// passe ce qui lit `env` (les liaisons des objets, l'identifiant admis) et ce
// qui lit `cloudflare:workers` (le relais de la purge publique). Ici,
// seulement des décisions pures et des modules purs : le test du faux cache
// (`__tests__/no-cache-in-between.spec.ts`) l'appelle tel quel.
//
// L'ordre des contrôles est la sécurité du chemin : l'appelant d'abord (403),
// puis l'aiguillage (404), puis la purge, puis l'objet. Inverser les deux
// premiers ouvrirait la purge à un appelant étranger.
import { internalObjectRouteOf, objectUrlOf, type InternalObject } from "./internal-objects";
import { withNoStore } from "./no-store";
import {
  isPublicPurgeRelay,
  purgeableTagOf,
  purgeStatusOf,
  type PurgeableTag,
} from "./public-shelf";
import { isTrustedCaller } from "./shelf-store";

/** Ce que la passerelle appelle sur un objet : sa liaison, déjà résolue par le Worker. */
export interface InternalObjectStub {
  fetch(request: Request): Promise<Response>;
}

/** Un appel intercepté, et tout ce que le Worker a déjà lu pour lui. */
export interface InternalObjectsCall {
  readonly request: Request;
  /** `ctx.containerId` du gestionnaire de sortie — absent si l'appelant n'est pas un conteneur. */
  readonly containerId: string | undefined;
  /** Les identifiants des conteneurs admis (aujourd'hui, l'instance unique de `Backend`). */
  readonly trustedIds: readonly string[];
  /** La liaison de chaque objet, liée à `env` par le Worker. */
  readonly stubs: Readonly<Record<InternalObject, () => InternalObjectStub>>;
  /** Le relais de la purge publique : il lit `cloudflare:workers`, donc il reste dans le Worker. */
  readonly relayPublicPurge: (tag: PurgeableTag) => Promise<Response>;
}

const STATUS_FOREIGN_CALLER = 403;
const STATUS_NO_OBJECT = 404;

/**
 * Répond à un appel du conteneur vers `objets.interne`. Toute réponse — ses
 * refus compris — porte `Cache-Control: no-store, private` : le cache du
 * point d'entrée `ContainerProxy` ne garde rien de ce chemin (`no-store.ts`).
 */
export async function answerInternalObjectsCall(call: InternalObjectsCall): Promise<Response> {
  return withNoStore(await routeInternalObjectsCall(call));
}

async function routeInternalObjectsCall(call: InternalObjectsCall): Promise<Response> {
  if (!isTrustedCaller(call.containerId, call.trustedIds)) {
    return new Response(null, { status: STATUS_FOREIGN_CALLER });
  }
  const url = new URL(call.request.url);
  const route = internalObjectRouteOf(url);
  if (route === null) {
    return new Response(null, { status: STATUS_NO_OBJECT });
  }
  if (route.object === "pro-shelves" && isPublicPurgeRelay(call.request.method, route.pathname)) {
    const tag = purgeableTagOf(url);
    return tag === null
      ? new Response(null, { status: purgeStatusOf({ kind: "unknown_tag" }) })
      : call.relayPublicPurge(tag);
  }
  return call.stubs[route.object]().fetch(new Request(objectUrlOf(url, route), call.request));
}
