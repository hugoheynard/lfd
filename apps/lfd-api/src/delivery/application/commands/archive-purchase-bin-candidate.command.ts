/** Archiver un format de bac candidat. */
export class ArchivePurchaseBinCandidateCommand {
  constructor(
    readonly candidateId: string,
    readonly staffUserId: string,
  ) {}
}
