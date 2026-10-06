/** **Le dossier du jour partira aussi à cette personne du personnel** (décision 4). */
export class AddStaffDossierRecipientCommand {
  constructor(
    readonly recipientStaffUserId: string,
    /** L'identité staff de qui inscrit, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
  ) {}
}
