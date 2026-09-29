/**
 * Où joindre le **calcul routier**, et avec quel jeton (plan de tournée,
 * lot 8 bis, L8b-C4).
 *
 * En production, le planificateur de tournées (OSRM aujourd'hui) se joint par la passerelle
 * (`https://lafoliecoffee.info/api/route-planner`), qui refuse toute requête sans le
 * jeton `ROUTE_PLANNER_TOKEN`. En développement, `http://localhost:5055` sert un OSRM
 * nu, sans jeton.
 */
export interface RoutePlannerEndpoint {
  /** La racine du service, sans `/table` ni `/route`. */
  readonly url: string;
  /** Présenté en `Authorization: Bearer` ; `null` hors production (OSRM nu). */
  readonly token: string | null;
}

/**
 * Un jeton plus court n'est pas un jeton : la passerelle refuse tout secret en
 * deçà (`gateway/src/route-planner-guard.ts`, même borne). `openssl rand -base64 48`
 * en donne 64 (L8b-C7).
 */
export const ROUTE_PLANNER_TOKEN_MIN_LENGTH = 32;

/** Ce que l'environnement a posé : les deux réglages bruts, et le mode. */
export interface RoutePlannerSettings {
  readonly url: string | null;
  readonly token: string | null;
  readonly production: boolean;
}

/**
 * Résout l'adresse du calcul routier, ou `null` : « Proposer » refuse alors
 * (`DisabledDistanceMatrix`), et la carte de santé le dit.
 *
 * **En production, fermé par défaut** : sans jeton valide, ou avec une adresse
 * qui n'est pas en `https://`, aucun appel ne part. Un Bearer envoyé en clair
 * serait un jeton donné à qui lit le réseau ; un appel sans jeton serait
 * refusé en 401 par la passerelle, à chaque « Proposer », sans que le
 * démarrage l'ait dit.
 *
 * Hors production, le jeton est facultatif et l'adresse libre : le poste de
 * dev parle à un OSRM local nu. Un jeton posé est tout de même présenté — il
 * permet d'éprouver la passerelle depuis un poste.
 */
export function resolveRoutePlannerEndpoint(
  settings: RoutePlannerSettings,
): RoutePlannerEndpoint | null {
  const { url, token, production } = settings;
  if (url === null) {
    return null;
  }
  const validToken =
    token !== null && token.length >= ROUTE_PLANNER_TOKEN_MIN_LENGTH ? token : null;
  if (!production) {
    return { url, token: validToken };
  }
  if (validToken === null || !isHttps(url)) {
    return null;
  }
  return { url, token: validToken };
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
