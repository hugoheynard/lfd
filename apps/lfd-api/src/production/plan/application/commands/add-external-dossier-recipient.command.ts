/** **Le dossier du jour partira aussi à cette autre personne** (décision 4). */
export class AddExternalDossierRecipientCommand {
  constructor(
    readonly email: string,
    /** Facultatif (Hugo, 2026-10-06) ; vide se lit comme absent. */
    readonly firstName: string | null,
    /** Facultatif ; vide se lit comme absent. */
    readonly lastName: string | null,
    /** Facultatif ; vide se lit comme absent. */
    readonly jobTitle: string | null,
    /** L'identité staff de qui inscrit, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
  ) {}
}
