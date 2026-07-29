/**
 * Configuration Auth0 **publique** de la plateforme B2B.
 *
 * Ces valeurs ne sont PAS secrètes : le `domain`, le `clientId` d'une SPA et
 * l'`audience` d'API sont conçus pour vivre dans le bundle navigateur (ils
 * transitent de toute façon dans l'URL `/authorize`). Le secret réel du flux
 * OIDC est le code d'autorisation à usage unique + PKCE, jamais ces constantes.
 *
 * Correspondance backend : `audience` DOIT être identique au `AUTH0_AUDIENCE`
 * du backend (`apps/lfc-B2B-platform-backend`) — c'est l'exact-match qui fait
 * que le jeton émis pour ce front est accepté par cette API et aucune autre.
 */
export interface AuthConfig {
  /** Tenant Auth0 (sans `https://`). */
  readonly domain: string;
  /** Client ID de l'**Application SPA** Auth0 (à créer côté tenant). */
  readonly clientId: string;
  /** Identifiant de l'**API** Auth0 = `AUTH0_AUDIENCE` du backend. */
  readonly audience: string;
  /** Base URL de l'API B2B appelée avec le jeton (ex. `GET /me`). */
  readonly apiBaseUrl: string;
}

/**
 * ⚠️ `clientId` À RENSEIGNER : Auth0 → Applications → Create Application →
 * « Single Page Application ». Copier le Client ID ici. Dans les réglages de
 * cette app, autoriser l'origine du front (voir `documentation/`) :
 *   - Allowed Callback URLs   : http://localhost:4200, https://lfc-b2b.pages.dev
 *   - Allowed Logout URLs     : http://localhost:4200, https://lfc-b2b.pages.dev
 *   - Allowed Web Origins     : http://localhost:4200, https://lfc-b2b.pages.dev
 */
export const AUTH_CONFIG: AuthConfig = {
  domain: 'dev-bjvl7ct5se266ij4.eu.auth0.com',
  clientId: 'Qk5sMKDBKB8OD3YC3JjIzfeXXkUf00qJ',
  // = Identifier de l'API Auth0 = AUTH0_AUDIENCE du backend (match exact).
  audience: 'https://api.lfc-b2b-platform',
  // Backend B2B en local (Node always-on, port 3200). L'URL de prod sera
  // câblée quand le backend sera déployé.
  apiBaseUrl: 'http://localhost:3200',
};
