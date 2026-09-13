import type { SalesTermsParagraphPayload } from "@lfd/contracts";

/** Command : ajouter un article en fin de document, dans les trois langues. */
export class AddSalesTermsParagraphCommand {
  constructor(
    readonly prose: SalesTermsParagraphPayload,
    readonly staffUserId: string,
  ) {}
}
