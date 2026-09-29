/** Retirer un véhicule de la flotte, à l'instant du geste. */
export class RetireVehicleCommand {
  constructor(readonly vehicleId: string) {}
}
