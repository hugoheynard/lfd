import type { PurchaseVehicleCandidatePayload } from "@lfd/contracts";

/** Faire entrer un véhicule candidat dans la bibliothèque d'achat. Rend son identifiant. */
export class DeclarePurchaseVehicleCandidateCommand {
  constructor(
    readonly payload: PurchaseVehicleCandidatePayload,
    readonly staffUserId: string,
  ) {}
}
