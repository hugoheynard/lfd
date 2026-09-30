/** Réactiver un format de bac candidat. */
export class ReactivatePurchaseBinCandidateCommand {
  constructor(
    readonly candidateId: string,
    readonly staffUserId: string,
  ) {}
}
