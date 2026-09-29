/**
 * La garde de `/api/osrm` — le calcul routier, joint par l'API **à travers**
 * la passerelle (plan de tournée, lot 8 bis, L8b-C1 à C3).
 *
 * `lfd-osrm` n'a aucune adresse publique : cette garde est donc la SEULE
 * serrure devant lui. Trois règles, dans cet ordre :
 *
 *   1. **une limite de débit par IP**, avant tout — un bombardement coûte des
 *      invocations de passerelle bornées, jamais un réveil du conteneur, et
 *      borne du même coup les essais de jeton ;
 *   2. **le jeton, FERMÉ PAR DÉFAUT** : sans secret posé (absent, vide, trop
 *      court), rien ne passe ; sans `Authorization: Bearer <jeton>` valide,
 *      rien ne passe. Un **401 uniforme**, même corps pour tous les refus, ni
 *      chemin ni liste des services ;
 *   3. le jeton ne va **pas plus loin** : l'en-tête est retiré avant de
 *      transmettre, `lfd-osrm` n'en a pas l'usage.
 *
 * Deux secrets acceptés, pour tourner sans coupure (L8b-C3) : `OSRM_TOKEN` et,
 * pendant une rotation seulement, `OSRM_TOKEN_NEXT`.
 *
 * Aucun import du monde Workers : des fonctions sur `Request`/`Response`,
 * exécutables sous Node pour les tests.
 */
import type { Target } from "./routes";

/**
 * En deçà, un secret n'en est pas un : un jeton vide ou de trois lettres ne
 * doit JAMAIS ouvrir la porte, même posé par erreur. `openssl rand -base64 48`
 * en donne 64 (L8b-C7). Même borne que `apps/lfd-api/src/platform/config/osrm-endpoint.ts`.
 */
export const OSRM_TOKEN_MIN_LENGTH = 32;

/** Contrat minimal du binding Rate Limiting de Cloudflare (`ratelimits`). */
export interface OsrmRateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Ce que la garde lit dans l'environnement du Worker. */
export interface OsrmGuardEnv {
  readonly OSRM_TOKEN?: string;
  readonly OSRM_TOKEN_NEXT?: string;
  /** Absent en `wrangler dev` : on ne limite alors rien, le jeton garde seul. */
  readonly OSRM_RATE_LIMITER?: OsrmRateLimiter;
}

/** L'issue : la requête à transmettre (jeton retiré), ou le refus à rendre. */
export type OsrmAdmission =
  | { readonly admitted: true; readonly request: Request }
  | { readonly admitted: false; readonly response: Response };

/**
 * Le corps de TOUS les refus d'authentification — secret absent, jeton
 * absent, jeton faux. Les distinguer apprendrait à un inconnu ce qui manque.
 */
export const UNAUTHORIZED_BODY = "Gateway LFC : accès refusé.";

const BEARER = /^Bearer (\S+)$/i;

/**
 * La garde propre à une destination, AVANT tout routage — même avant de savoir
 * si son binding existe : un refus ne doit rien dire de ce qui se trouve
 * derrière. Rend la requête à transmettre, ou le refus. Seul `/api/osrm` en a
 * une ; `lfd-api` porte ses propres gardes.
 */
export async function guardTarget(
  target: Target,
  request: Request,
  env: OsrmGuardEnv,
): Promise<Request | Response> {
  if (target.kind !== "backend" || target.backend !== "osrm") {
    return request;
  }
  const admission = await admitOsrm(request, env);
  return admission.admitted ? admission.request : admission.response;
}

/** Admet ou refuse une requête vers `/api/osrm`. */
export async function admitOsrm(request: Request, env: OsrmGuardEnv): Promise<OsrmAdmission> {
  if (!(await withinRate(request, env.OSRM_RATE_LIMITER))) {
    return { admitted: false, response: tooManyRequests() };
  }
  const presented = presentedToken(request);
  const accepted = [env.OSRM_TOKEN, env.OSRM_TOKEN_NEXT].filter(isUsableSecret);
  if (presented === null || !(await matchesAny(presented, accepted))) {
    return { admitted: false, response: unauthorized() };
  }
  const headers = new Headers(request.headers);
  headers.delete("authorization");
  return { admitted: true, request: new Request(request, { headers }) };
}

/** Un secret vide, absent ou trop court n'est JAMAIS un secret valide. */
function isUsableSecret(secret: string | undefined): secret is string {
  return secret !== undefined && secret.length >= OSRM_TOKEN_MIN_LENGTH;
}

/** Le jeton de `Authorization: Bearer …`, ou `null` s'il manque ou est trop court. */
function presentedToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const token = header === null ? undefined : BEARER.exec(header.trim())?.[1];
  return isUsableSecret(token) ? token : null;
}

/**
 * Compare à **temps constant** : chaque candidat est condensé en SHA-256, puis
 * les deux condensés (toujours 32 octets) sont comparés octet par octet sans
 * sortie anticipée. La durée ne dit ni la longueur du secret, ni le nombre de
 * caractères justes. On compare à TOUS les secrets acceptés, sans court-circuit.
 */
async function matchesAny(presented: string, accepted: readonly string[]): Promise<boolean> {
  const mine = await digest(presented);
  let matched = false;
  for (const secret of accepted) {
    const equal = sameBytes(mine, await digest(secret));
    matched = matched || equal;
  }
  return matched;
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

/**
 * La limite, par IP cliente de confiance (`cf-connecting-ip`, posée par
 * Cloudflare). Sans IP — ce qui n'arrive pas depuis Internet —, une clé
 * commune : on limite quand même, plutôt que d'ouvrir une voie sans compteur.
 */
async function withinRate(
  request: Request,
  limiter: OsrmRateLimiter | undefined,
): Promise<boolean> {
  if (limiter === undefined) {
    return true;
  }
  const ip = request.headers.get("cf-connecting-ip");
  const key = ip !== null && ip !== "" ? `osrm:${ip}` : "osrm:sans-ip";
  const { success } = await limiter.limit({ key });
  return success;
}

function unauthorized(): Response {
  return new Response(UNAUTHORIZED_BODY, {
    status: 401,
    headers: { "www-authenticate": "Bearer", "content-type": "text/plain; charset=utf-8" },
  });
}

function tooManyRequests(): Response {
  return new Response("Gateway LFC : trop de requêtes.", {
    status: 429,
    headers: { "retry-after": "60", "content-type": "text/plain; charset=utf-8" },
  });
}
