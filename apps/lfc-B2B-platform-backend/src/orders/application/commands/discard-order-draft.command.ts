/** Jette le brouillon d'une société — on repart d'un écran vide. */
export class DiscardOrderDraftCommand {
  constructor(readonly companyId: string) {}
}
