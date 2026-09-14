import type { LegalMention } from "@lfd/contracts";

/** Command : déplacer un article au rang demandé, à partir de zéro. */
export class MoveLegalDocumentParagraphCommand {
  constructor(
    readonly mention: LegalMention,
    readonly paragraphId: string,
    readonly position: number,
    readonly staffUserId: string,
  ) {}
}
