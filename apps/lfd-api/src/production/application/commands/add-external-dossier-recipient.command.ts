/** **Le dossier du jour partira aussi à cette autre personne** (décision 4). */
export class AddExternalDossierRecipientCommand {
  constructor(
    readonly email: string,
    readonly firstName: string,
    readonly lastName: string,
    /** Facultatif ; vide se lit comme absent. */
    readonly jobTitle: string | null,
    /** L'identité staff de qui inscrit, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
  ) {}
}
