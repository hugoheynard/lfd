import type { VehiclePayload } from "@lfd/contracts";

/** Faire entrer un véhicule dans la flotte. Rend son identifiant. */
export class AddVehicleCommand {
  constructor(readonly payload: VehiclePayload) {}
}
