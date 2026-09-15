/** Supprime DÉFINITIVEMENT une note du carnet d'un client, photo comprise, **par un agent**. */
export class RemoveClientNoteCommand {
  constructor(
    readonly companyId: string,
    readonly noteId: string,
  ) {}
}
