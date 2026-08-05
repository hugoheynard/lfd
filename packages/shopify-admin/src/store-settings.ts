/**
 * D'où le transport tire le **domaine de boutique** et la **version d'API** —
 * port (DIP). L'app le sert depuis ses réglages (base, config…) ; le package ne
 * connaît ni Prisma ni stockage. Un retour plus large est accepté (covariance) :
 * un service de réglages qui rend davantage satisfait ce contrat tel quel.
 */
export interface ShopifyStoreCoordinates {
  readonly shopDomain: string;
  readonly apiVersion: string;
}

export interface ShopifyStoreSettings {
  read(): Promise<ShopifyStoreCoordinates>;
}
