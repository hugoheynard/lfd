import { AUTH_ENV } from './auth.env.generated';

/**
 * Configuration Auth0 **publique** de la plateforme B2B.
 *
 * Ces valeurs ne sont PAS secrètes : le `domain`, le `clientId` d'une SPA et
 * l'`audience` d'API sont conçus pour vivre dans le bundle navigateur (ils
 * transitent de toute façon dans l'URL `/authorize`). Le secret réel du flux
 * OIDC est le code d'autorisation à usage unique + PKCE, jamais ces constantes.
 *
 * **Injectées au build**, pas en dur : les valeurs viennent de l'environnement via
 * `scripts/generate-auth-config.mjs` → `auth.env.generated.ts` (git-ignored). Source :
 * le `.env` de l'app en **dev local**, les variables **CI / Cloudflare** en **déployé**.
 * Voir `.env.example`.
 *
 * Correspondance backend : `audience` DOIT être identique au `AUTH0_AUDIENCE`
 * du backend (`apps/lfd-api`) — c'est l'exact-match qui fait
 * que le jeton émis pour ce front est accepté par cette API et aucune autre.
 */
export interface AuthConfig {
  /** Tenant Auth0 (sans `https://`). */
  readonly domain: string;
  /** Client ID de l'**Application SPA** Auth0. */
  readonly clientId: string;
  /** Identifiant de l'**API** Auth0 = `AUTH0_AUDIENCE` du backend. */
  readonly audience: string;
  /** Base URL de l'API B2B appelée avec le jeton (ex. `GET /me`). */
  readonly apiBaseUrl: string;
  /**
   * Adresse du dépôt Sentry, ou chaîne vide — alors rien n'est envoyé et
   * l'application démarre sans lui.
   *
   * Publique par nature : elle voyage dans le bundle, tout visiteur peut la
   * lire. Ce n'est pas un secret, c'est une adresse de dépôt — le secret, côté
   * Sentry, c'est le jeton qui téléverse les *source maps*, et lui ne quitte
   * jamais la CI.
   */
  readonly sentryDsn: string;
  /**
   * Origine de l'app **admin**, sans barre finale — la seule chose que cette
   * app sache de sa voisine.
   *
   * Elle sert à fabriquer l'URL qu'un **QR de retrait** encode : le client
   * l'affiche, mais c'est le staff qui la scanne, donc elle pointe vers le
   * back-office. Vide ⇒ aucun QR n'est affiché, plutôt qu'un code qui ne mènerait
   * nulle part une fois scanné devant un client.
   */
  readonly adminBaseUrl: string;
}

export const AUTH_CONFIG: AuthConfig = {
  domain: AUTH_ENV.domain,
  clientId: AUTH_ENV.clientId,
  audience: AUTH_ENV.audience,
  apiBaseUrl: AUTH_ENV.apiBaseUrl,
  adminBaseUrl: AUTH_ENV.adminBaseUrl,
  sentryDsn: AUTH_ENV.sentryDsn,
};
