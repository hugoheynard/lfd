/**
 * L'état du rayon public tel que le magasin des rayons le tient (C3) : son
 * drapeau, ÉTEINT par défaut, et la version des rayons — la même version
 * globale que monte toute purge (`ShopShelfEraser`).
 */
export interface PublicShelfState {
  readonly enabled: boolean;
  readonly version: number;
}

/**
 * **Lire l'état du rayon public** (`plan-cache-du-catalogue.md`, § 3) : l'API
 * le relève avant ET après le calcul d'un rayon public, et ne laisse
 * Cloudflare garder la réponse que si rien n'a bougé entre les deux.
 *
 * Un port de lecture, seul (ISP) : la purge de Workers Cache est
 * {@link PublicShelfEraser}, appelée par d'autres.
 */
export abstract class PublicShelfStateReader {
  abstract read(): Promise<PublicShelfState>;
}
