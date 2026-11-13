/** La valeur envoyée à tout objet interne : aucun cache ne sert cet appel. */
export const INTERNAL_CALL_NO_STORE = "no-store";

/**
 * Un appel de l'API à un objet interne (`objets.interne`) porte
 * `Cache-Control: no-store`, pour tout cache entre le conteneur et l'objet.
 *
 * L'interception de sortie du conteneur passe par un point d'entrée du
 * Worker, dont le Workers Cache gardait un « absent » (404) et le resservait
 * à l'API sans que l'objet le voie (`le-cache-du-back-office.md`, § 7). Les
 * objets répondent aussi `no-store` : les deux côtés le disent.
 *
 * L'option `cache: "no-store"` n'est pas posée : le `fetch` de Node (undici)
 * n'a pas de cache HTTP, et son type `RequestInit` ne déclare pas le champ
 * (vérifié le 2026-11-13, Node 22.23).
 */
export function uncachedInternalCall(init: RequestInit): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", INTERNAL_CALL_NO_STORE);
  return { ...init, headers };
}
