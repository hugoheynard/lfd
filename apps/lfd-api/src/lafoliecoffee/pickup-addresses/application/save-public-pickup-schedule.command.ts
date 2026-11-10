import type { PublicPickupSchedulePayload } from "@lfd/contracts";

/**
 * Enregistre **en bloc** l'horaire public d'un point : ses plages de créneaux et
 * ses fermetures datées.
 *
 * En bloc parce que le refus se juge sur l'ensemble — deux plages acceptables
 * séparément peuvent se chevaucher (plan `plan-creneaux-de-retrait.md`, D7). Et
 * parce que c'est le geste réel de l'opérateur : il édite sa grille, il
 * l'enregistre.
 */
export class SavePublicPickupScheduleCommand {
  constructor(
    readonly pickupAddressId: string,
    readonly payload: PublicPickupSchedulePayload,
  ) {}
}
