import type { VehiclePayload } from "@lfd/contracts";

/**
 * Faire entrer un véhicule dans la flotte. Rend son identifiant.
 * `intentKey` : la clé que l'écran a fabriquée pour ce geste — un double clic
 * ne fait entrer qu'un véhicule (sans plaque, rien d'autre ne l'empêcherait).
 */
export class AddVehicleCommand {
  constructor(
    readonly payload: VehiclePayload,
    readonly staffUserId: string,
    readonly intentKey: string,
  ) {}
}
