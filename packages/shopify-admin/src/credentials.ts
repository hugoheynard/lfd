/**
 * Identifiants d'authentification Shopify — **ports** consommés par le transport.
 * L'app fournit le concret (variables d'environnement, config) ; le package ne
 * connaît jamais `process.env`.
 */

/** Paire du *client credentials grant* (app Dev Dashboard). */
export interface ShopifyOAuthCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

/**
 * D'où viennent les identifiants — vue **étroite** (ISP) : le provider n'a besoin
 * que de ces deux sources, pas de tout l'environnement. Dépendre du port plutôt
 * que d'une classe concrète (DIP) rend l'échange testable.
 */
export interface ShopifyCredentialsSource {
  /** Jeton statique d'une *legacy custom app*, ou `null`. */
  shopifyAdminToken(): string | null;
  /** Paire client credentials, ou `null` si non configurée. */
  shopifyOAuthCredentials(): ShopifyOAuthCredentials | null;
}
