import type { VehiclePayload } from "@lfd/contracts";

/** Corriger la fiche entière d'un véhicule — absent vaut `null` (voir `vehiclePayloadSchema`). */
export class CorrectVehicleCommand {
  constructor(
    readonly vehicleId: string,
    readonly payload: VehiclePayload,
  ) {}
}
