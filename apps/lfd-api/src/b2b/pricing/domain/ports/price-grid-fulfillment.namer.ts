/**
 * Le nom d'un point de retrait ou d'une zone de livraison, pour l'en-tête de la
 * grille de prix. `null` = inconnu : la grille le refuse plutôt que d'écrire un
 * identifiant que personne ne saurait lire.
 */
export abstract class PriceGridFulfillmentNamer {
  abstract pickupNameOf(pickupId: string): Promise<string | null>;
  abstract zoneNameOf(zoneId: string): Promise<string | null>;
}
