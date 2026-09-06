/**
 * Ce qu'il reste de la station de maquette : **le carnet d'adresses**.
 *
 * 🔴 **Les points de retrait et les zones en sont partis le 2026-09-06.** Ils
 * portaient une remise en pourcentage et des frais en euros flottants, écrits
 * en dur ; ils viennent de `GET /pickup-addresses` et `GET /delivery-zones`
 * (cf. `ServicePoints`), et les montants du panier de `POST /shop/quote`.
 *
 * 🔴 **Les CRÉNEAUX en sont partis le même jour.** `ORDER_SLOTS` posait huit
 * heures fixes, les mêmes pour tous les points, avec des états sans source —
 * « complet » affirmait une capacité que rien ne mesure. Et `slotDate()` posait
 * « demain » depuis l'horloge du navigateur du client. La grille se déduit
 * désormais des heures déclarées du point (`pickupSlots`), et la journée vient
 * de `GET /fulfillment-days` — donc de l'horloge du serveur, heure limite
 * comprise.
 *
 * Ce qui reste ici n'a pas de source : le carnet d'adresses du client. Il
 * existe côté API pour un client CONNECTÉ (`AddressesService`, par entreprise),
 * ce que la boutique n'est pas encore.
 */

/** Une adresse du carnet. */
export interface SavedAddress {
  readonly id: string;
  readonly label: string;
  /** Le complément, comme pour un point de retrait : « au chalet », « au bureau ». */
  readonly at: string;
  readonly street: string;
  readonly postcode: string;
  readonly isDefault: boolean;
}

export const SAVED_ADDRESSES: readonly SavedAddress[] = [
  {
    id: 'chalet',
    label: 'Le Chalet',
    at: 'au chalet',
    street: '18 chemin des Barmettes',
    postcode: '73150',
    isDefault: true,
  },
  {
    id: 'bureau',
    label: 'Bureau',
    at: 'au bureau',
    street: '4 avenue Olympique',
    postcode: '73150',
    isDefault: false,
  },
];
