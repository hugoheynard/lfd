/**
 * Query : les points de retrait de la boutique pour une audience **déclarée**
 * — le visiteur particulier (défaut) ou la vitrine pro (`?audience=pro`),
 * chacun avec SA remise et elle seule (plan
 * `chaque-audience-son-information`, § 5.1). Une route publique ne connaît
 * personne : la clientèle « pros en cours d'inscription » n'y est pas
 * déclarable, elle ne sort que par `/pickup-addresses/mine`.
 */
export class ListShopPickupsQuery {
  constructor(readonly audience: ShopPickupsAudience) {}
}

/** Les deux audiences qu'un appel anonyme peut déclarer. */
export type ShopPickupsAudience = "visitor" | "pro";
