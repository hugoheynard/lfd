/** Command : revenir au modèle d'origine — retirer le document publié et le brouillon. */
export class RevertMailDocumentCommand {
  constructor(
    readonly template: string,
    readonly expectedRevision: number,
    readonly staffUserId: string,
  ) {}
}
