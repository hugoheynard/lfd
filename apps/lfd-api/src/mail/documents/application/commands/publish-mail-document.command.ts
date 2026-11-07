/**
 * Command : publier l'arrangement d'un e-mail ET ses phrases en attente,
 * ensemble (plan `plan-editeur-par-blocs.md`, § 11).
 */
export class PublishMailDocumentCommand {
  constructor(
    readonly template: string,
    readonly expectedRevision: number,
    readonly staffUserId: string,
  ) {}
}
