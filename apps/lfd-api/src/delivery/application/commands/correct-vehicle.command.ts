import type { VehiclePayload } from "@lfd/contracts";

/** Corriger le nom et la plaque d'un véhicule. */
export class CorrectVehicleCommand {
  constructor(
    readonly vehicleId: string,
    readonly payload: VehiclePayload,
  ) {}
}
