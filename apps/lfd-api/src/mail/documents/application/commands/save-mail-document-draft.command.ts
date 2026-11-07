import type { MailDocument } from "@lfd/mail-blocks";

/** Command : enregistrer le brouillon de l'arrangement d'un e-mail, sur la révision lue. */
export class SaveMailDocumentDraftCommand {
  constructor(
    readonly template: string,
    readonly document: MailDocument,
    readonly expectedRevision: number,
    readonly staffUserId: string,
  ) {}
}
