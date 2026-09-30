/** Réactiver un véhicule candidat. */
export class ReactivatePurchaseVehicleCandidateCommand {
  constructor(
    readonly candidateId: string,
    readonly staffUserId: string,
  ) {}
}
