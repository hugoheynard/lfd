// Les décisions du rayon PUBLIC côté Worker (`documentation/pricing/moteur/plan-cache-du-catalogue.md`,
// lot C3) : quelle requête est une purge de Workers Cache, et laquelle n'en
// est jamais une.
//
// Isolé de `worker.ts` pour la même raison que `edge-guard.ts` et
// `shelf-store.ts` : le rendre testable. Zéro import, des fonctions pures.
//
// Le chemin d'une purge publique, et pourquoi il fait un détour :
//
//   API ──http://rayons.interne/public/purge──▶ gestionnaire de sortie
//        (point d'entrée `ContainerProxy`, appelant contrôlé par `containerId`)
//     ──boucle locale, `props` de purge──▶ point d'entrée PAR DÉFAUT
//     ──▶ `ctx.cache.purge({ tags: ["rayon-public"] })`
//
// La doc Cloudflare (relue le 2026-11-04) dit que « des points d'entrée
// différents ont des caches séparés » et que seul le Worker propriétaire
// purge le sien : les réponses publiques sont gardées par le point d'entrée
// par défaut (celui que la passerelle joint), donc c'est lui qui purge. Une
// purge appelée depuis `ContainerProxy` n'est pas documentée.
// ⚠️ NON PROUVÉ (2026-11-04) : que la boucle `exports.default` arrive bien sur
// le cache du point d'entrée par défaut, et que `ctx.cache` y existe.

/**
 * L'étiquette des réponses publiques gardées par Workers Cache — la même que
 * celle que l'API pose (`PUBLIC_SHELF_CACHE_TAG`, `public-shelf-cache-headers.ts`).
 */
export const PUBLIC_SHELF_TAG = "rayon-public";

/** Le chemin que l'API appelle chez `rayons.interne` pour purger le rayon public. */
export const PUBLIC_SHELF_PURGE_PATH = "/public/purge";

/**
 * La marque d'une purge venue de la boucle locale. Seul ce Worker la pose
 * (`exports.default({ props })`) : une requête du dehors — la passerelle par
 * sa liaison de service, un navigateur — arrive sans `props`, ou avec ceux de
 * la liaison, jamais avec celle-ci.
 */
export const PUBLIC_PURGE_PROPS = { purpose: "public-shelf-purge" } as const;

/**
 * **Le gestionnaire de sortie relaie-t-il une purge publique ?** Un `POST` sur
 * {@link PUBLIC_SHELF_PURGE_PATH} — le reste va à l'objet des rayons pro.
 * Appelé APRÈS le contrôle de l'appelant (`isTrustedCaller`).
 */
export function isPublicPurgeRelay(method: string, pathname: string): boolean {
  return method === "POST" && pathname === PUBLIC_SHELF_PURGE_PATH;
}

/**
 * **Le point d'entrée par défaut purge-t-il ?** Seulement si la requête porte
 * les `props` de la boucle locale ET vise le chemin de purge en `POST`. Toute
 * autre requête — sans `props`, avec d'autres, sur un autre chemin — suit le
 * chemin ordinaire vers le conteneur, qui n'a aucune route de purge : une
 * requête du dehors ne peut JAMAIS déclencher une purge.
 */
export function isPublicPurgeCall(props: unknown, method: string, pathname: string): boolean {
  if (typeof props !== "object" || props === null) {
    return false;
  }
  return (
    Reflect.get(props, "purpose") === PUBLIC_PURGE_PROPS.purpose &&
    isPublicPurgeRelay(method, pathname)
  );
}

/** Ce que la purge a rendu, traduit en statut pour l'API. */
export type PublicPurgeOutcome =
  | { readonly kind: "purged" }
  | { readonly kind: "cache_unavailable" }
  | { readonly kind: "refused"; readonly errors: readonly string[] };

const STATUS_PURGED = 204;
/** `ctx.cache` absent : Workers Cache n'est pas activé sur ce Worker (`wrangler.jsonc`). */
const STATUS_CACHE_UNAVAILABLE = 503;
/** Cloudflare a refusé la purge (débit de l'offre gratuite, par exemple). */
const STATUS_REFUSED = 502;

/** Le statut que l'API lit : 204 seul vaut « purgé ». */
export function purgeStatusOf(outcome: PublicPurgeOutcome): number {
  switch (outcome.kind) {
    case "purged":
      return STATUS_PURGED;
    case "cache_unavailable":
      return STATUS_CACHE_UNAVAILABLE;
    case "refused":
      return STATUS_REFUSED;
  }
}
