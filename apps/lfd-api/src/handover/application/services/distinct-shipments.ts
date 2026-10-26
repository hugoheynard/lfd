import type { ShipmentRef } from "../../../production/channels/handover/index.js";

/**
 * Les envois d'un fait, chacun une fois (plan E7 reliquat, L4b) : un fait
 * qui nommerait deux fois le même envoi n'écrit pas deux fois la garde.
 */
export function distinctShipments(shipments: readonly ShipmentRef[]): ShipmentRef[] {
  const kept: ShipmentRef[] = [];
  for (const shipment of shipments) {
    if (!kept.some((other) => other.equals(shipment))) {
      kept.push(shipment);
    }
  }
  return kept;
}
