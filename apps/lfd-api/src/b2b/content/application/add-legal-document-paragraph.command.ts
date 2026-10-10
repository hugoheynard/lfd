import type { LegalDocumentParagraphPayload, LegalMention } from "@lfd/contracts";

/** Command : ajouter un article en fin de document, dans les trois langues. */
export class AddLegalDocumentParagraphCommand {
  constructor(
    readonly mention: LegalMention,
    readonly prose: LegalDocumentParagraphPayload,
    /**
     * La révision que l'écran a lue : l'écriture lui est conditionnée (B2).
     * `undefined` = pas de contrôle, le temps que le back-office l'envoie.
     */
    readonly expectedRevision: number,
    readonly staffUserId: string,
  ) {}
}
