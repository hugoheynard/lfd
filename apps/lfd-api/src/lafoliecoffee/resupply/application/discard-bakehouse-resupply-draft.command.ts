/** « Supprimer le brouillon » : il passe `discarded`, sous la version lue. */
export class DiscardBakehouseResupplyDraftCommand {
  constructor(
    readonly draftId: string,
    readonly version: number,
    readonly staffUserId: string,
  ) {}
}
