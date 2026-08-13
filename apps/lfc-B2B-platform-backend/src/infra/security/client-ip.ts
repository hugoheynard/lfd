/**
 * Résout l'IP cliente **réelle** d'une requête, pour le rate limiting applicatif.
 *
 * ⚠️ Le backend tourne derrière un Worker Cloudflare : `req.ip` (vu par Express)
 * serait l'IP de l'infra, identique pour tous les clients → un tracker inutile.
 * On lit, dans l'ordre :
 *   1. `x-lfc-client-ip` — voir la garantie ci-dessous ;
 *   2. `cf-connecting-ip` — posé par Cloudflare, valable en accès direct ;
 *   3. `req.ip` — dev local (pas de Cloudflare devant) ;
 *   4. `"unknown"` — dernier recours (ne bloque pas, borne partagée).
 *
 * ## Qui garantit `x-lfc-client-ip`, et depuis quand
 *
 * **Le Worker d'entrée** (`container/worker.ts`), qui le réécrit systématiquement
 * depuis `cf-connecting-ip` avant de transmettre — et le SUPPRIME s'il n'a pas
 * d'IP. C'est la frontière de confiance : dernier point qui connaît la vraie IP,
 * premier que la requête franchit.
 *
 * Ce commentaire affirmait auparavant que « la gateway » s'en chargeait. C'était
 * FAUX, et coûteux : aucune gateway n'a jamais été sur le chemin (aucune route
 * déclarée, `PROD_ROUTES` vide, domaine visé inexistant en DNS). L'en-tête
 * arrivait donc tel que le client l'avait écrit, et le throttler le suivait
 * docilement. Mesuré en production le 2026-08-13 sur `/platform-settings`
 * (60/min) : 75 requêtes à en-tête FIXE → 15 rejets ; 75 à en-tête TOURNANT →
 * **zéro rejet**. Une limite qu'on croit avoir et qu'on n'a pas.
 *
 * La leçon dépasse ce fichier : un commentaire qui écrit « non spoofable » doit
 * nommer QUI écrase la valeur et sur QUEL chemin. Sans ça c'est un vœu, et
 * personne ne le revérifie.
 */
export function resolveClientIp(req: Record<string, unknown>): string {
  const forwarded = firstHeaderValue(req, "x-lfc-client-ip");
  if (forwarded !== null) {
    return forwarded;
  }
  const fromCloudflare = firstHeaderValue(req, "cf-connecting-ip");
  if (fromCloudflare !== null) {
    return fromCloudflare;
  }
  const ip = req["ip"];
  if (typeof ip === "string" && ip !== "") {
    return ip;
  }
  return "unknown";
}

/** Lit un en-tête HTTP sur une requête non typée, sans supposer sa forme. */
function firstHeaderValue(req: Record<string, unknown>, name: string): string | null {
  const headers = req["headers"];
  if (typeof headers !== "object" || headers === null) {
    return null;
  }
  const value = (headers as Record<string, unknown>)[name];
  if (typeof value === "string" && value !== "") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string" && value[0] !== "") {
    return value[0];
  }
  return null;
}
