/** Archiver un véhicule candidat. */
export class ArchivePurchaseVehicleCandidateCommand {
  constructor(
    readonly candidateId: string,
    readonly staffUserId: string,
  ) {}
}
