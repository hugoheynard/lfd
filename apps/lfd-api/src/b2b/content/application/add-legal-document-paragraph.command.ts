import type { LegalDocumentParagraphPayload, LegalMention } from "@lfd/contracts";

/** Command : ajouter un article en fin de document, dans les trois langues. */
export class AddLegalDocumentParagraphCommand {
  constructor(
    readonly mention: LegalMention,
    readonly prose: LegalDocumentParagraphPayload,
    readonly staffUserId: string,
  ) {}
}
