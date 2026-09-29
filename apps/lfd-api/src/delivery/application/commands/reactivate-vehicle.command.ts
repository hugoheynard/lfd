/** Remettre en service un véhicule retiré. */
export class ReactivateVehicleCommand {
  constructor(readonly vehicleId: string) {}
}
