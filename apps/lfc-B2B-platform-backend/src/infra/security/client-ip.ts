/**
 * Résout l'IP cliente **réelle** d'une requête, pour le rate limiting applicatif.
 *
 * ⚠️ Le backend tourne derrière deux Workers Cloudflare (gateway → worker
 * backend) : `req.ip` (vu par Express) serait l'IP de l'infra, identique pour
 * tous les clients → un tracker inutile. On lit, dans l'ordre :
 *   1. `x-lfc-client-ip` — l'IP réelle recopiée **et écrasée** par la gateway
 *      (non spoofable ; seule valeur fiable après le saut de gateway) ;
 *   2. `cf-connecting-ip` — posé par Cloudflare, valable en accès direct ;
 *   3. `req.ip` — dev local (pas de Cloudflare devant) ;
 *   4. `"unknown"` — dernier recours (ne bloque pas, borne partagée).
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
