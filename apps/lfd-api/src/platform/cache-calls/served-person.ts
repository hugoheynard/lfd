import { createHash } from "node:crypto";

import { currentRequestContext } from "../context/request-context.store.js";
import { assertOutsideTransaction } from "../database/outside-transaction.js";

/**
 * L'en-tête qui porte l'empreinte de la personne servie vers un objet partagé.
 * Recopié par le conteneur (`container/cache-metrics-store.ts`,
 * `SERVED_PERSON_HEADER`), qui ne peut pas importer `src/`.
 */
export const SERVED_PERSON_HEADER = "x-cache-person";

/** Ce qu'un adaptateur d'objet appelle : `fetch`, ou une réponse fabriquée en test. */
export type ObjectFetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * **L'empreinte irréversible de la personne de la requête** — `sha256(sel,
 * type, identifiant interne)` — pour que l'objet compte des personnes
 * distinctes sans jamais savoir qui. Jamais d'e-mail, de nom ni de `sub` :
 * seul l'identifiant interne que le garde a posé dans le contexte.
 *
 * `null` sans sel, hors requête, ou pour un appelant sans personne (cron,
 * visiteur) : l'appel n'est alors pas compté comme une personne.
 */
export function servedPersonOf(salt: string | null): string | null {
  const actor = currentRequestContext()?.actor;
  if (salt === null || actor === undefined || actor.type === "system" || actor.id === null) {
    return null;
  }
  return createHash("sha256").update(`${salt}\u0000${actor.type}\u0000${actor.id}`).digest("hex");
}

/**
 * Un `fetch` vers un objet qui joint l'empreinte de la personne servie. Sans
 * personne, l'appel part tel quel : le compte ne retient jamais une lecture.
 */
export function personStampedFetch(
  salt: string | null,
  fetchFn: ObjectFetch = (url, init) => fetch(url, init),
): ObjectFetch {
  return (url, init) => {
    assertOutsideTransaction("objets-partages.appel");
    const person = servedPersonOf(salt);
    if (person === null) {
      return fetchFn(url, init);
    }
    const headers = new Headers(init.headers);
    headers.set(SERVED_PERSON_HEADER, person);
    return fetchFn(url, { ...init, headers });
  };
}
