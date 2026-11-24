/**
 * **À qui écrire pour un panier** — déclaré par les paniers récurrents,
 * implémenté par le commerce (`account`, qui tient l'annuaire des clients).
 * Port étroit : l'abonné qui annonce une nouvelle version des CGV n'a besoin
 * que d'une adresse (plan `plan-bloc-recurrent.md`, § 7).
 */
export abstract class BasketBuyerContacts {
  /**
   * L'adresse de l'acheteur, ou `null` s'il n'en a pas de lisible : rien ne
   * part, et le panier garde quand même l'annonce.
   */
  abstract emailOf(userId: string): Promise<string | null>;
}
