import { AUTH_ENV } from "./auth.env.generated";

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
    /**
     * API « suite » (entitlements). Le shell demande CE jeton au login et lit sa
     * claim `permissions` (`app:pim`, `app:b2b-admin`, `suite:settings`) pour
     * dessiner le launcher. Pas forcément un backend déployé — namespace de
     * permissions. L'enforcement réel reste sur chaque backend enfant.
     */
    readonly self: string;
    /** Backend B2B, surface **client** (son `AUTH0_AUDIENCE`). */
    readonly b2b: string;
    /**
     * Backend B2B, surface **staff** (son `AUTH0_ADMIN_AUDIENCE`) — audience
     * distincte de `b2b`, bien que servie par le MÊME backend.
     *
     * Une API Auth0 n'est pas une adresse : son identifiant est une chaîne
     * opaque, jamais résolue ni appelée. Deux APIs peuvent donc désigner un seul
     * service, et c'est ce qui sépare ici les deux publics. Les confondre ferait
     * accepter par `/admin/*` le jeton de n'importe quel client de la boutique —
     * le vérificateur staff ne contrôle que l'émetteur et l'audience.
     */
    readonly b2bAdmin: string;
    readonly pim: string;
  };
}

export const SUITE_AUTH_CONFIG: SuiteAuthConfig = {
  domain: AUTH_ENV.domain,
  clientId: AUTH_ENV.clientId,
  audiences: {
    self: AUTH_ENV.audiences.self,
    b2b: AUTH_ENV.audiences.b2b,
    b2bAdmin: AUTH_ENV.audiences.b2bAdmin,
    pim: AUTH_ENV.audiences.pim,
  },
};

/** Backends adressables par la suite — une audience Auth0 chacun. */
export type SuiteAudience = keyof typeof SUITE_AUTH_CONFIG.audiences;
