/**
 * L'horaire public d'un point — ses plages de créneaux et ses fermetures, tels
 * qu'ils sont enregistrés. L'écran de réglages les rejoue.
 */
export class GetPublicPickupScheduleQuery {
  constructor(readonly pickupAddressId: string) {}
}
