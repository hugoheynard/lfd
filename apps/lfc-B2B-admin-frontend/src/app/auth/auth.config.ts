import { AUTH_ENV } from './auth.env.generated';

/**
 * Configuration Auth0 **publique** de l'app B2B admin, pour sa vie **hors du
 * shell**.
 *
 * Ces valeurs ne sont pas secrètes (domaine, clientId d'une SPA, audience d'API) :
 * elles transitent de toute façon dans l'URL `/authorize`. Le secret réel du flux
 * OIDC est le code d'autorisation à usage unique + PKCE.
 *
 * **Injectées au build** via `scripts/generate-auth-config.mjs` →
 * `auth.env.generated.ts` (git-ignored). Source : le `.env` de l'app en dev
 * local, les variables CI / Cloudflare en déployé. Voir `.env.example`.
 *
 * L'`audience` DOIT valoir l'`AUTH0_ADMIN_AUDIENCE` du backend B2B — c'est
 * l'exact-match qui fait qu'un jeton émis pour CETTE app est accepté sur la
 * surface `/admin/*`, et qu'un jeton client ne l'est jamais (Invariant C).
 */
export interface StaffAuthConfig {
  /** Tenant Auth0 (sans `https://`). */
  readonly domain: string;
  /** Client ID de l'**Application SPA** Auth0 dédiée au back-office. */
  readonly clientId: string;
  /** Identifiant de l'API staff = `AUTH0_ADMIN_AUDIENCE` du backend B2B. */
  readonly audience: string;
}

export const STAFF_AUTH_CONFIG: StaffAuthConfig = {
  domain: AUTH_ENV.domain,
  clientId: AUTH_ENV.clientId,
  audience: AUTH_ENV.audience,
};

/**
 * Vrai quand les trois valeurs sont là. Une configuration **incomplète n'est pas
 * une erreur** : c'est l'état normal d'un poste de dev où le backend tourne en
 * bypass staff (`AUTH_ADMIN_DEV_BYPASS`). On ne fournit alors pas Auth0 du tout,
 * plutôt que de laisser le SDK partir vers un `/authorize` sur un domaine vide
 * et rendre une page blanche que personne ne saurait diagnostiquer.
 */
export const STAFF_AUTH_CONFIGURED =
  STAFF_AUTH_CONFIG.domain !== '' &&
  STAFF_AUTH_CONFIG.clientId !== '' &&
  STAFF_AUTH_CONFIG.audience !== '';
