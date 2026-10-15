import type { PickupAddressUpdatePayload, SiteView } from '@lfd/contracts';

/**
 * **La charge du `PATCH` du lieu, depuis l'état ENREGISTRÉ** — puis la seule
 * partie que la carte appelante change (Hugo, 2026-10-13 : chaque carte
 * enregistre ce qu'elle montre).
 *
 * Une seule route écrit l'adresse, les heures et la réduction (`PATCH admin/sites/:id`, relu le 2026-10-13) : il n'existe pas de
 * route par sujet. Renvoyer l'état relu pour tout le reste garantit qu'une
 * carte n'écrase pas la saisie non enregistrée d'une autre. `gps` est absent :
 * il reste inchangé (il se saisit avec les rôles).
 */
export function placePayload(
  site: SiteView,
  change: Partial<PickupAddressUpdatePayload>,
): PickupAddressUpdatePayload {
  return {
    label: site.label,
    ligne1: site.ligne1,
    ligne2: site.ligne2,
    codePostal: site.codePostal,
    ville: site.ville,
    pays: site.pays,
    opening: site.opening,
    discount: site.discount,
    discountAudiences: site.discountAudiences,
    ...change,
  };
}
