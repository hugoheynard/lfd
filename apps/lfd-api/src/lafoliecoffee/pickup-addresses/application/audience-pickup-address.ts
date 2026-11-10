import {
  pickupDiscountFor,
  type AudiencePickupAddressView,
  type PickupAddressView,
  type PickupAnnouncementKey,
} from "@lfd/contracts";

/**
 * **Un point, pour UNE audience** — la seule forme que la boutique reçoit
 * (Hugo, 2026-10-31 : « chaque audience n'a le droit qu'à son information » ;
 * `documentation/promotions/plan-chaque-audience-son-information.md`, § 5).
 *
 * La vue complète porte une remise par acheteur type (`announcedFor`, dans
 * l'annonce des promotions) : le back-office en a besoin, un visiteur non. On
 * en garde celle de `key` et on reconstruit le point champ par champ — jamais
 * par décomposition de la vue : un champ ajouté demain à `PickupAddressView`
 * ne doit pas sortir sur une route publique sans qu'on l'ait écrit ici.
 */
export function audiencePickupAddressOf(
  view: PickupAddressView,
  key: PickupAnnouncementKey,
): AudiencePickupAddressView {
  return {
    id: view.id,
    label: view.label,
    ligne1: view.ligne1,
    ligne2: view.ligne2,
    codePostal: view.codePostal,
    ville: view.ville,
    pays: view.pays,
    discount: pickupDiscountFor(view, key),
    opening: view.opening,
    gps: view.gps ?? null,
  };
}
