// Politique d'edge du Worker d'entrée : limiter par IP, puis réécrire l'en-tête
// d'IP cliente avant de transmettre au container.
//
// Isolé de `worker.ts` pour UNE raison : le rendre testable. `worker.ts` importe
// `@cloudflare/containers` et déclare une classe Durable Object — l'importer
// depuis Jest tirerait tout le monde Workers. Ici, zéro import : des fonctions
// pures sur `Request`, exécutables sous Node comme sous Workers.
//
// Ce fichier a longtemps existé à l'identique dans le container du PIM, et son
// en-tête portait l'avertissement qui va avec : deux copies d'une primitive de
// sécurité, toute correction à reporter des deux côtés. Le jumeau a disparu
// avec l'app (B2c) — il n'y a plus qu'un exemplaire, plus de dérive possible,
// et plus de dette à mutualiser dans un paquet compilé pour le monde Workers.

/** L'en-tête que le backend NestJS lit pour identifier le client (throttler). */
export const CLIENT_IP_HEADER = "x-lfc-client-ip";

/** Contrat minimal du binding Rate Limiting de Cloudflare. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * IP cliente **de confiance** : `cf-connecting-ip`, posée par Cloudflare sur
 * toute requête entrante et hors de portée du client.
 *
 * On ne lit surtout PAS `x-lfc-client-ip` : cette valeur vient du client.
 * `null` ⇒ pas d'IP (appel interne, cron), on ne limite rien.
 */
export function trustedClientIp(request: Request): string | null {
  const direct = request.headers.get("cf-connecting-ip");
  return direct !== null && direct !== "" ? direct : null;
}

/**
 * Réécrit `x-lfc-client-ip` depuis l'IP de confiance, et le **supprime** quand
 * il n'y en a pas — plutôt que de laisser filer une valeur d'origine cliente sur
 * un chemin qu'on ne remplace pas.
 *
 * C'est ce qui rend VRAI l'invariant que le backend suppose (`resolveClientIp`).
 * Il était faux : aucune gateway n'a jamais été sur le chemin, l'en-tête
 * arrivait tel que le client l'avait écrit, et le throttler suivait. Mesuré en
 * production le 2026-08-13 : en-tête tournant ⇒ zéro rejet sur 75 requêtes.
 */
export function withTrustedClientIp(request: Request): Request {
  const headers = new Headers(request.headers);
  const real = trustedClientIp(request);
  if (real === null) {
    headers.delete(CLIENT_IP_HEADER);
  } else {
    headers.set(CLIENT_IP_HEADER, real);
  }
  return new Request(request, { headers });
}

/** 429 renvoyé quand une IP dépasse son quota edge. `Retry-After` = fenêtre. */
export function tooManyRequests(): Response {
  return new Response("Too Many Requests", {
    status: 429,
    headers: { "retry-after": "60", "content-type": "text/plain" },
  });
}

/**
 * Le point d'entrée complet : limite, puis transmet — **toujours** la requête
 * réécrite, jamais l'originale.
 *
 * `forward` est injecté plutôt que d'appeler le container directement : c'est la
 * couture qui permet à un test de vérifier CE QUI EST TRANSMIS. Sans elle, on ne
 * pourrait tester que le helper, et un retour à `backend(env).fetch(request)`
 * passerait inaperçu — or c'est exactement la régression qui rouvrirait le trou.
 */
export async function guardedFetch(
  request: Request,
  limiter: RateLimiter,
  forward: (request: Request) => Promise<Response>,
): Promise<Response> {
  const ip = trustedClientIp(request);
  if (ip !== null) {
    const { success } = await limiter.limit({ key: ip });
    if (!success) {
      return tooManyRequests();
    }
  }
  return forward(withTrustedClientIp(request));
}
