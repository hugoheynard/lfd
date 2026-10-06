/** **Le dossier du jour ne partira plus à ce destinataire.** */
export class RemoveDossierRecipientCommand {
  constructor(
    readonly recipientId: string,
    /** L'identité staff de qui retire, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
  ) {}
}
