import type { AnnouncedPickupDiscounts } from "@lfd/contracts";

/**
 * **Ce que la boutique annonce de la remise d'un point**, quand ce n'est plus
 * la fiche du site qui la porte (`documentation/promotions/promotions.md`, § 2.16, lot L8).
 *
 * Déclaré ici, implémenté par les promotions : après la bascule, la caisse
 * applique la promotion panier du point, et l'annonce
 * (`PickupAddressView.discounts`) doit dire la même — sinon la boutique
 * promet une remise et la caisse en applique une autre.
 */
export abstract class PickupDiscountAnnouncer {
  /**
   * Les remises annoncées de ces points, par identifiant. Depuis L12, la
   * seule source : les colonnes de remise du site ne font plus foi.
   */
  abstract announced(
    pickupIds: readonly string[],
  ): Promise<ReadonlyMap<string, AnnouncedPickupDiscounts>>;
}
