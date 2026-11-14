/**
 * Les mesures de chaque réponse (`Server-Timing`, `X-Shelf-Cache`) ne sortent
 * que pour qui porte le secret de diagnostic — `documentation/todos/plan-mesures-privees.md`.
 *
 * Le tri se fait à la SORTIE de la passerelle : c'est le seul qui tient pour
 * une réponse venue d'un cache de l'API, gardée avec les mesures de la requête
 * qui l'a remplie. La passerelle est devant tous ces caches, et rien ne la
 * contourne (le Worker de l'API et le planificateur n'ont ni `workers_dev` ni
 * route, vérifié le 2026-11-14).
 */

/** L'en-tête que Hugo envoie, par une extension de navigateur. Ne quitte jamais la passerelle. */
export const DIAGNOSTIC_HEADER = "x-lfd-diagnostic";

/** Les en-têtes qui décrivent la fabrication d'une réponse. */
const DIAGNOSTIC_RESPONSE_HEADERS = ["server-timing", "x-shelf-cache"] as const;

const SWITCHING_PROTOCOLS = 101;

/**
 * Vrai seulement si le secret est configuré ET que la requête porte le même.
 *
 * Les deux valeurs sont hachées avant d'être comparées : les condensats ont
 * toujours 32 octets, donc la comparaison parcourt toujours tout et rien ne
 * fuit de la longueur du secret. Sans secret configuré : toujours faux.
 */
export async function isDiagnostic(request: Request, secret: string | undefined): Promise<boolean> {
  const presented = request.headers.get(DIAGNOSTIC_HEADER);
  if (secret === undefined || secret === "" || presented === null) {
    return false;
  }
  const [expected, actual] = await Promise.all([sha256(secret), sha256(presented)]);
  return sameBytes(new Uint8Array(expected), new Uint8Array(actual));
}

/** La requête d'origine, sans le secret : aucune cible ne doit le recevoir. */
export function withoutDiagnosticSecret(request: Request): Request {
  if (!request.headers.has(DIAGNOSTIC_HEADER)) {
    return request;
  }
  const headers = new Headers(request.headers);
  headers.delete(DIAGNOSTIC_HEADER);
  return new Request(request, { headers });
}

/**
 * La réponse rendue au navigateur. Sans diagnostic : les mesures sont
 * effacées. Avec : elles restent, et `private, no-store` empêche un cache en
 * aval de garder une copie mesurée pour la servir à un autre.
 *
 * Une 101 (WebSocket, HMR de dev) passe telle quelle : elle ne porte pas de
 * mesures, et la refaire pourrait perdre son `webSocket`.
 */
export function sortDiagnosticHeaders(response: Response, diagnostic: boolean): Response {
  if (response.status === SWITCHING_PROTOCOLS) {
    return response;
  }
  const sorted = new Response(response.body, response);
  if (diagnostic) {
    sorted.headers.set("cache-control", "private, no-store");
    return sorted;
  }
  for (const name of DIAGNOSTIC_RESPONSE_HEADERS) {
    sorted.headers.delete(name);
  }
  return sorted;
}

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

/**
 * Comparaison en temps constant de deux condensats de même longueur : on
 * accumule les différences au lieu de s'arrêter à la première. Écrite ici
 * plutôt que `crypto.subtle.timingSafeEqual`, propre à Workers, pour que les
 * tests sous Node éprouvent le même code.
 */
function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
