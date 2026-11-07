/** Command : publier le brouillon de la charte d'un espace, sur la révision lue. */
export class PublishMailCharterCommand {
  constructor(
    readonly space: string,
    readonly expectedRevision: number,
    readonly staffUserId: string,
  ) {}
}

/** Ce que la publication pose : la version de la charte, et celle des textes des e-mails. */
export interface MailCharterPublication {
  readonly version: number;
  readonly publicationVersion: number;
}
