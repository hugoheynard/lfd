/**
 * **Le nom d'un point de retrait, au moment d'un geste** — ce que le journal
 * fige à côté de l'id. Déclaré par les paniers récurrents, implémenté par le
 * commerce (`pickup-addresses`). Un point inconnu rend `null` : il se cite
 * par son id, il ne s'invente pas de nom.
 */
export abstract class BasketPickupPoints {
  abstract nameOf(pickupAddressId: string): Promise<string | null>;
}
