import type { StaffPermission } from '@lfd/contracts';

/**
 * Peut-on LIRE la flotte, le point de départ et les réglages du calcul ?
 *
 * Oui sous `delivery_settings:read` **ou** `delivery_rounds:read` : qui prépare
 * une tournée doit voir ces réglages, jamais les modifier — l'écriture reste
 * `delivery_settings:write` (plan-preparation-de-tournee.md, § 6, Q10 « A »).
 * Le serveur applique la même règle (`@RequireAnyPermission` sur les trois `GET`).
 *
 * Les écrans de RÉGLAGE (Véhicules, Point de départ) gardent leur propre droit :
 * cette règle ne sert qu'aux écrans qui préremplissent depuis ces lectures.
 */
export function canReadDeliverySettings(can: (permission: StaffPermission) => boolean): boolean {
  return can('delivery_settings:read') || can('delivery_rounds:read');
}
