import { createRemoteJWKSet } from "jose";

/** Les clés publiques d'un tenant Auth0, telles que `jose` les tient. */
export type RemoteKeySet = ReturnType<typeof createRemoteJWKSet>;

/**
 * Vingt-quatre heures. Le défaut de `jose` est dix minutes, et passé ce délai la
 * requête suivante ATTEND le rechargement (`remote.js`, `getKey` → `reload`,
 * lu dans jose 6.2.3 le 2026-11-05). Mesuré en production ce jour-là : après
 * dix minutes de calme, six appels de l'ouverture de la boutique ont attendu
 * Auth0 3,3 à 3,8 s, à peine sous le délai d'abandon de cinq secondes.
 *
 * Garder les clés plus longtemps ne retarde pas une rotation : un jeton signé
 * par une clé inconnue fait recharger aussitôt (même fichier, `getKey`, au
 * plus une fois par `cooldownDuration`, trente secondes).
 */
export const REMOTE_KEY_SET_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Le jeu de clés d'un tenant, gardé {@link REMOTE_KEY_SET_MAX_AGE_MS}. */
export function remoteKeySet(jwksUri: URL): RemoteKeySet {
  return createRemoteJWKSet(jwksUri, { cacheMaxAge: REMOTE_KEY_SET_MAX_AGE_MS });
}
