import type { PurchaseVehicleCandidatePayload } from "@lfd/contracts";

/** Corriger la fiche ENTIÈRE d'un véhicule candidat. */
export class CorrectPurchaseVehicleCandidateCommand {
  constructor(
    readonly candidateId: string,
    readonly payload: PurchaseVehicleCandidatePayload,
    readonly staffUserId: string,
  ) {}
}
