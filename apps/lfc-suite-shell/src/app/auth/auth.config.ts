/**
 * Configuration Auth0 **publique** de la Suite (shell hôte).
 *
 * Le shell possède la session : un seul login pour toute la suite d'outils
 * internes. Les valeurs ne sont pas secrètes (domain, clientId SPA, audiences)
 * — le secret du flux OIDC est le code + PKCE, jamais ces constantes.
 *
 * `audiences` : un identifiant d'API Auth0 **par backend**. Le shell détient une
 * session unique et échange un jeton par audience (`getAccessTokenSilently`
 * ciblé). Chaque remote reçoit le jeton de SON backend — un login, N murs d'API.
 * Chaque valeur DOIT matcher le `AUTH0_AUDIENCE` du backend correspondant.
 */
export interface SuiteAuthConfig {
  readonly domain: string;
  readonly clientId: string;
  readonly audiences: {
    readonly b2b: string;
    readonly pim: string;
  };
}

/**
 * ⚠️ `clientId` À RENSEIGNER : Auth0 → Applications → « Single Page
 * Application » dédiée à la Suite (distincte des SPA client). Autoriser les
 * origines du shell (Callback / Logout / Web Origins) :
 *   - http://localhost:7300
 *   - https://lfc-suite.pages.dev
 */
export const SUITE_AUTH_CONFIG: SuiteAuthConfig = {
  domain: 'dev-bjvl7ct5se266ij4.eu.auth0.com',
  clientId: 'REPLACE_WITH_SUITE_SPA_CLIENT_ID',
  audiences: {
    b2b: 'https://api.lfc-b2b-platform',
    pim: 'https://api.lfc-pim',
  },
};
