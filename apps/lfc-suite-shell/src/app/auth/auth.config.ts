import { AUTH_ENV } from './auth.env.generated';

/**
 * Configuration Auth0 **publique** de la Suite (shell hôte).
 *
 * Le shell possède la session : un seul login pour toute la suite d'outils
 * internes. Les valeurs ne sont pas secrètes (domain, clientId SPA, audiences)
 * — le secret du flux OIDC est le code + PKCE, jamais ces constantes.
 *
 * **Injectées au build**, pas en dur : les valeurs viennent de l'environnement via
 * `scripts/generate-auth-config.mjs` → `auth.env.generated.ts` (git-ignored). Source :
 * le `.env` du shell en **dev local**, les variables **CI / Cloudflare** en **déployé**.
 * Voir `.env.example`.
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

export const SUITE_AUTH_CONFIG: SuiteAuthConfig = {
  domain: AUTH_ENV.domain,
  clientId: AUTH_ENV.clientId,
  audiences: {
    b2b: AUTH_ENV.audiences.b2b,
    pim: AUTH_ENV.audiences.pim,
  },
};

/** Backends adressables par la suite — une audience Auth0 chacun. */
export type SuiteAudience = keyof typeof SUITE_AUTH_CONFIG.audiences;
