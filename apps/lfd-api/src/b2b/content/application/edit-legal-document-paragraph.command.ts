import type { LegalDocumentParagraphPayload, LegalMention } from "@lfd/contracts";

/** Command : réécrire un article existant. L'identifiant survit à la réécriture. */
export class EditLegalDocumentParagraphCommand {
  constructor(
    readonly mention: LegalMention,
    readonly paragraphId: string,
    readonly prose: LegalDocumentParagraphPayload,
    readonly staffUserId: string,
  ) {}
}
