import type { LegalMention } from "@lfd/contracts";

/** Command : retirer un article du document d'une mention. */
export class RemoveLegalDocumentParagraphCommand {
  constructor(
    readonly mention: LegalMention,
    readonly paragraphId: string,
    readonly staffUserId: string,
  ) {}
}
