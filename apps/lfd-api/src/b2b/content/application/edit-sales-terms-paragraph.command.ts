import type { SalesTermsParagraphPayload } from "@lfd/contracts";

/** Command : réécrire un article existant. L'identifiant survit à la réécriture. */
export class EditSalesTermsParagraphCommand {
  constructor(
    readonly paragraphId: string,
    readonly prose: SalesTermsParagraphPayload,
    readonly staffUserId: string,
  ) {}
}
