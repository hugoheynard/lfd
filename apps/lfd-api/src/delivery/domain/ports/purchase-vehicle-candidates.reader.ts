import type { PurchaseVehicleCandidateView } from "@lfd/contracts";

/**
 * Port de **lecture** des véhicules candidats — distinct du port d'écriture
 * (ISP) et de `FleetReader` : la flotte ne voit jamais un candidat (B-D1).
 */
export abstract class PurchaseVehicleCandidatesReader {
  /** Par nom ; les archivés seulement si `includeArchived`. */
  abstract list(includeArchived: boolean): Promise<readonly PurchaseVehicleCandidateView[]>;
}
